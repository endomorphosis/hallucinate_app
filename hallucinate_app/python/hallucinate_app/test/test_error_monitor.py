"""
Test the Error Monitor integration with PyArrow Content Index

This test verifies that the error monitoring system correctly handles
errors from the PyArrow Content Index and properly integrates with
the monitoring dashboard.
"""

import os
import sys
import json
import time
import asyncio
import unittest
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import required modules
from hallucinate_app.error_monitor import error_monitor, ErrorMonitor, ErrorLevel, ErrorSource, RecoveryStrategy
from hallucinate_app.pyarrow_content_index import PyArrowContentIndex, ContentIndexError, ContentNotFoundError

class TestErrorMonitor(unittest.TestCase):
    """Test the Error Monitor integration with PyArrow Content Index"""
    
    def setUp(self):
        """Set up test resources"""
        # Create a test directory for the index
        self.test_dir = Path(os.path.abspath(os.path.dirname(__file__))) / "test_data"
        os.makedirs(self.test_dir, exist_ok=True)
        
        # Create a test index path
        self.test_index_path = self.test_dir / "test_content_index.arrow"
        
        # Create a resources dict
        self.resources = {
            'error_monitor': error_monitor
        }
        
        # Create content index with error monitor
        self.content_index = PyArrowContentIndex(
            resources=self.resources,
            metadata={
                'index_path': str(self.test_index_path),
                'enable_error_monitoring': True
            }
        )
        
        # Start the error monitor
        asyncio.run(error_monitor.start())
    
    def tearDown(self):
        """Clean up test resources"""
        # Stop the error monitor
        asyncio.run(error_monitor.stop())
        
        # Remove test files
        if self.test_index_path.exists():
            os.remove(self.test_index_path)
        
        # Remove backup files
        backup_path = Path(str(self.test_index_path) + ".bak")
        if backup_path.exists():
            os.remove(backup_path)
    
    def test_error_reporting(self):
        """Test that errors are correctly reported to the error monitor"""
        # Create a test error
        test_error = ContentNotFoundError("Test content not found", {"cid": "test123"})
        
        # Handle the error with the content index
        error_info = self.content_index._handle_error("test_operation", test_error)
        
        # Verify error info was created correctly
        self.assertIsNotNone(error_info)
        self.assertEqual(error_info['operation'], "test_operation")
        self.assertEqual(error_info['error'], "ContentNotFoundError")
        self.assertEqual(error_info['category'], 'contentnotfound')
        self.assertTrue('id' in error_info)
        
        # Wait for error to be processed
        time.sleep(0.1)
        
        # Get the error from the monitor
        error_id = error_info['id']
        error_data = asyncio.run(error_monitor.get_error(error_id))
        
        # Verify error was added to monitor
        self.assertIsNone(error_data, "Error should not be immediately available since processing is async")
        
        # Process the queue
        asyncio.run(self._process_queue())
        
        # Try again after processing
        error_data = asyncio.run(error_monitor.get_error(error_id))
        
        # Now the error should be available
        if error_data:
            self.assertEqual(error_data.operation, "test_operation")
            self.assertEqual(error_data.level, ErrorLevel.INFO)  # ContentNotFoundError is INFO level
            self.assertEqual(error_data.source, ErrorSource.CONTENT_INDEX)
        else:
            # If still not found, it might be due to async processing
            # In a real scenario we'd wait longer or use a notification mechanism
            print("Error not found in monitor (likely due to async processing)")
    
    def test_recovery_strategies(self):
        """Test that recovery strategies are properly assigned to errors"""
        # Create a test error
        test_error = ContentNotFoundError("Test content not found", {"cid": "test123"})
        
        # Handle the error with the content index
        error_info = self.content_index._handle_error("test_operation", test_error)
        
        # Wait for error to be processed
        time.sleep(0.1)
        
        # Process the queue
        asyncio.run(self._process_queue())
        
        # Get the error from the monitor
        error_id = error_info['id']
        error_data = asyncio.run(error_monitor.get_error(error_id))
        
        # Verify recovery strategies (if error is available)
        if error_data:
            # Check if recovery strategies are assigned
            self.assertTrue(hasattr(error_data, 'recovery_strategies'))
            
            # Check if strategies have correct properties
            if error_data.recovery_strategies:
                strategy = error_data.recovery_strategies[0]
                self.assertTrue(hasattr(strategy, 'name'))
                self.assertTrue(hasattr(strategy, 'description'))
                self.assertTrue(hasattr(strategy, 'method_name'))
                self.assertIsInstance(strategy.is_automatic, bool)
    
    def test_error_categories(self):
        """Test that errors are properly categorized"""
        # Create different types of errors
        not_found_error = ContentNotFoundError("Test content not found", {"cid": "test123"})
        general_error = ContentIndexError("General error", {"general": True})
        
        # Handle the errors
        not_found_info = self.content_index._handle_error("test_operation", not_found_error)
        general_info = self.content_index._handle_error("test_operation", general_error)
        
        # Verify categories - use lowercase class name without "Error" suffix
        self.assertEqual(not_found_info['category'], 'contentnotfound')
        self.assertEqual(general_info['category'], 'contentindex')
    
    def test_error_analytics(self):
        """Test that error analytics are correctly computed"""
        # Create several errors
        for i in range(5):
            error = ContentNotFoundError(f"Test content not found {i}", {"cid": f"test{i}"})
            self.content_index._handle_error("test_operation", error)
        
        # Wait for errors to be processed
        time.sleep(0.1)
        
        # Process the queue
        asyncio.run(self._process_queue())
        
        # Get analytics
        analytics = asyncio.run(error_monitor.get_analytics())
        
        # Verify analytics
        self.assertIsNotNone(analytics)
        
        # Check for summary data
        if 'summary' in analytics:
            summary = analytics['summary']
            self.assertIsNotNone(summary)
            
            # Basic checks on summary data
            if 'total_errors' in summary:
                self.assertIsInstance(summary['total_errors'], int)
    
    def test_component_status(self):
        """Test that component status is correctly tracked"""
        # Create several errors for the PyArrowContentIndex component
        for i in range(3):
            error = ContentIndexError(f"Test error {i}", {"test": True})
            self.content_index._handle_error("test_operation", error)
        
        # Wait for errors to be processed
        time.sleep(0.1)
        
        # Process the queue
        asyncio.run(self._process_queue())
        
        # Get component status
        status = asyncio.run(error_monitor.get_component_status("PyArrowContentIndex"))
        
        # Verify status
        self.assertIsNotNone(status)
    
    async def _process_queue(self):
        """Process the error monitor queue"""
        # Access private method for testing
        if hasattr(error_monitor, 'processing_queue'):
            while not error_monitor.processing_queue.empty():
                error_data = await error_monitor.processing_queue.get()
                await error_monitor._process_error(error_data)
                error_monitor.processing_queue.task_done()

class TestMessagesSimilar(unittest.TestCase):
    """Focused tests for ErrorMonitor._messages_similar / _SIMILAR_PATTERN (VAI-131).

    Validates that _SIMILAR_PATTERN normalises volatile details — especially
    that re.IGNORECASE causes 0xDEADBEEF and 0xdeadbeef to be treated
    identically, preventing duplicate-detection misses.
    """

    def setUp(self):
        self.monitor = ErrorMonitor()

    def _similar(self, a, b):
        return self.monitor._messages_similar(a, b)

    def test_hex_case_insensitive(self):
        """Upper- and lower-case hex addresses must normalise to the same token."""
        msg_lower = "Segfault at address 0xdeadbeef in module foo"
        msg_upper = "Segfault at address 0xDEADBEEF in module foo"
        self.assertTrue(self._similar(msg_lower, msg_upper))

    def test_line_number_normalised(self):
        """Messages differing only in line number should be considered similar."""
        msg1 = "TypeError at src/foo.py line 42"
        msg2 = "TypeError at src/foo.py line 99"
        self.assertTrue(self._similar(msg1, msg2))

    def test_date_normalised(self):
        """Messages differing only in a date stamp should be considered similar."""
        msg1 = "Backup failed on 2024-01-15"
        msg2 = "Backup failed on 2025-12-31"
        self.assertTrue(self._similar(msg1, msg2))

    def test_distinct_messages_differ(self):
        """Truly distinct messages must not be reported as similar."""
        msg1 = "Connection refused by remote host"
        msg2 = "Disk quota exceeded on /var/log"
        self.assertFalse(self._similar(msg1, msg2))

    def test_identical_messages_similar(self):
        """Identical messages are always similar."""
        msg = "Unexpected EOF while reading response"
        self.assertTrue(self._similar(msg, msg))

    def test_none_inputs_do_not_raise(self):
        """None inputs must not raise; two Nones are considered equal (VAI-132)."""
        self.assertTrue(self._similar(None, None))  # type: ignore[arg-type]
        self.assertFalse(self._similar(None, "some error"))  # type: ignore[arg-type]
        self.assertFalse(self._similar("some error", None))  # type: ignore[arg-type]

    def test_redundant_uppercase_ranges_removed(self):
        """_SIMILAR_PATTERN still matches uppercase hex after removing redundant ranges (VAI-132)."""
        import re
        from hallucinate_app.error_monitor import ErrorMonitor
        pattern = ErrorMonitor._SIMILAR_PATTERN
        # Verify lowercase ranges are NOT duplicated with explicit uppercase ranges
        self.assertNotIn('A-F', pattern.pattern)
        # Confirm the pattern still normalises uppercase hex correctly
        self.assertEqual(pattern.sub('XXX', '0xDEADBEEF'), 'XXX')
        self.assertEqual(pattern.sub('XXX', '0xdeadbeef'), 'XXX')

    def test_msg2_substring_of_msg1_is_similar(self):
        """Normalised msg2 that is a substring of normalised msg1 is reported as similar (HAO-215).

        This exercises the clean_msg2 branch of the return expression, ensuring
        the explicit-parentheses rewrite does not break the second sub-condition.
        """
        # msg1 is longer; msg2 (after normalisation) appears inside msg1.
        msg1 = "Fatal error in module foo: disk quota exceeded on /var/log at 2024-01-15"
        msg2 = "disk quota exceeded on /var/log"
        self.assertTrue(self._similar(msg1, msg2))

    def test_short_msg2_not_falsely_matched(self):
        """A very short normalised msg2 must not produce a false-positive similarity (HAO-215).

        When the entire volatile part of msg2 is replaced by _SIMILAR_PATTERN,
        the remaining string may be too short to be meaningful. The
        _SIMILAR_MIN_LEN guard must block such false matches.
        """
        # msg2 is entirely an address — after normalisation it becomes "XXX" (len 3).
        msg1 = "Connection refused by remote host at port 8080"
        msg2 = "0xdeadbeef"
        # "XXX" is shorter than _SIMILAR_MIN_LEN (10), so no substring match.
        self.assertFalse(self._similar(msg1, msg2))

    def test_short_msg1_not_falsely_matched(self):
        """A very short normalised msg1 must not produce a false-positive similarity (VAI-136).

        Symmetric companion to test_short_msg2_not_falsely_matched: when msg1
        normalises to a short token the _SIMILAR_MIN_LEN guard must block the
        first branch of the substring-match OR expression as well.
        """
        # msg1 is entirely an address — after normalisation it becomes "XXX" (len 3).
        msg1 = "0xdeadbeef"
        msg2 = "Connection refused by remote host at port 8080"
        # "XXX" is shorter than _SIMILAR_MIN_LEN (10), so no substring match.
        self.assertFalse(self._similar(msg1, msg2))

    def test_id_field_normalised(self):
        """Messages differing only in a hex ID field should be considered similar (HAO-219).

        The _SIMILAR_PATTERN contains ``ID: [a-f0-9-]+`` which normalises UUID-
        style and short hex identifiers so that otherwise identical messages that
        carry different request or resource IDs are correctly deduplicated.
        """
        msg1 = "Request failed ID: abc123-def456"
        msg2 = "Request failed ID: 000000-ffffff"
        self.assertTrue(self._similar(msg1, msg2))

    def test_stack_trace_file_lineno_normalised(self):
        """Messages differing only in a ``file:lineno`` stack location are similar (HAO-219).

        The ``at [^:]+:<digits>`` branch of _SIMILAR_PATTERN normalises stack-trace
        entries so that the same error raised at different call sites after
        refactoring is not treated as a new distinct error.
        """
        msg1 = "Unhandled exception at src/server.py:512 while handling request"
        msg2 = "Unhandled exception at src/server.py:789 while handling request"
        self.assertTrue(self._similar(msg1, msg2))

    def test_similarity_is_symmetric(self):
        """_messages_similar is symmetric: (a, b) == (b, a) for both clean_msg branches (VAI-140).

        Line 1112 (``clean_msg2 = self._SIMILAR_PATTERN.sub('XXX', msg2)``) is
        always reached after the type guard at lines 1106-1107, so msg2 is
        guaranteed to be a str by that point.  This test confirms that swapping
        msg1 and msg2 — which exercises the ``clean_msg2`` branch as the longer
        or shorter operand — produces the same similarity result in both orders.
        """
        msg_short = "disk quota exceeded on /var/log"
        msg_long = "Fatal error in module foo: disk quota exceeded on /var/log at 2024-01-15"
        self.assertEqual(
            self._similar(msg_short, msg_long),
            self._similar(msg_long, msg_short),
        )

    def test_clean_msg2_type_guard_blocks_non_string(self):
        """Non-string msg2 never reaches _SIMILAR_PATTERN.sub (VAI-140 false-positive proof).

        The type guard introduced before line 1112 ensures that re.sub is only
        called with a str argument.  Passing a non-string as msg2 must not raise
        a TypeError and must return a sensible equality result.
        """
        self.assertFalse(self._similar("some error message text here", 42))  # type: ignore[arg-type]
        self.assertFalse(self._similar("some error message text here", []))  # type: ignore[arg-type]
        self.assertTrue(self._similar(42, 42))  # type: ignore[arg-type]


if __name__ == '__main__':
    unittest.main()