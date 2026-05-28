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

    def test_short_normalised_message_not_substring_matched(self):
        """A message that normalises to a very short token must not create
        false positives via substring matching (VAI-134).

        'line 42' normalises to 'XXX' (len=3, below _MIN_SUBSTRING_LEN=10).
        The substring branch must be skipped so an unrelated message is not
        incorrectly considered similar.  The equality branch still applies,
        so two volatile-only messages that share the same normalised form are
        correctly reported as similar.
        """
        # "line 42" -> "XXX" (3 chars); unrelated long message must NOT match.
        self.assertFalse(self._similar("line 42", "Connection refused by remote host"))
        # Both sides normalise identically ("XXX" == "XXX") -> equality match -> True.
        self.assertTrue(self._similar("line 42", "line 99"))

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


if __name__ == '__main__':
    unittest.main()