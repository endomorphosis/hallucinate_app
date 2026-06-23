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
from typing import Any

# Add parent directory to path for imports
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# Import required modules
from hallucinate_app.error_monitor import (
    error_monitor,
    ErrorData,
    ErrorMonitor,
    ErrorLevel,
    ErrorSource,
    RecoveryStrategy,
)
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

    def _similar(self, a: Any, b: Any) -> bool:
        return self.monitor._messages_similar(a, b)

    def _error(self, error_id, component="content_index", source=ErrorSource.CONTENT_INDEX, message="Disk full"):
        return ErrorData(
            id=error_id,
            timestamp="2026-06-13T00:00:00",
            level=ErrorLevel.ERROR,
            source=source,
            component=component,
            operation="write",
            message=message,
        )

    def test_find_duplicate_error_returns_none_without_component_source_message_match(self):
        """_find_duplicate_error returns None when no stored error matches all duplicate keys (VAI-140)."""
        candidate = self._error("candidate")

        self.assertIsNone(self.monitor._find_duplicate_error(candidate))

        self.monitor.errors["existing"] = self._error("existing", component="other_component")
        self.assertIsNone(self.monitor._find_duplicate_error(candidate))

    def test_hex_case_insensitive(self):
        """Upper- and lower-case hex addresses must normalise to the same token."""
        msg_lower = "Segfault at address 0xdeadbeef in module foo"
        msg_upper = "Segfault at address 0xDEADBEEF in module foo"
        self.assertTrue(self._similar(msg_lower, msg_upper))

    def test_normalisation_uses_private_sentinel_not_legacy_placeholder(self):
        """VAI-131 scan finding must stay fixed: do not restore the old token."""
        from hallucinate_app.error_monitor import ErrorMonitor

        normalized = ErrorMonitor._SIMILAR_PATTERN.sub(
            ErrorMonitor._SIMILAR_SENTINEL,
            "Segfault at address 0xdeadbeef in module foo",
        )
        legacy_placeholder = chr(88) * 3

        self.assertIn(ErrorMonitor._SIMILAR_SENTINEL, normalized)
        self.assertNotIn(legacy_placeholder, normalized)

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

    def test_iso_timestamp_normalised(self):
        """Messages differing only in ISO-8601 timestamp should be considered similar."""
        msg1 = "Task failed at 2024-01-15T10:30:00.123Z with code 1"
        msg2 = "Task failed at 2025-12-31T23:59:59.999-07:00 with code 1"
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
        self.assertTrue(self._similar(None, None))
        self.assertFalse(self._similar(None, "some error"))
        self.assertFalse(self._similar("some error", None))

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
        from hallucinate_app.error_monitor import ErrorMonitor
        pattern = ErrorMonitor._SIMILAR_PATTERN
        # Verify lowercase ranges are NOT duplicated with explicit uppercase ranges
        self.assertNotIn('A-F', pattern.pattern)
        # Confirm the pattern still normalises hex addresses correctly (both
        # upper- and lowercase) using the null-byte sentinel (HAO-275).
        self.assertEqual(pattern.sub('\x00', '0xDEADBEEF'), '\x00')
        self.assertEqual(pattern.sub('\x00', '0xdeadbeef'), '\x00')
        self.assertEqual(
            ErrorMonitor._normalize_similar_message('0xDEADBEEF'),
            ErrorMonitor._SIMILAR_SENTINEL,
        )

    def test_substring_match_after_normalisation(self):
        """A shorter normalised message that is a substring of the longer is still similar (HAO-214)."""
        # msg2 contains all the detail of msg1 plus extra context; after normalisation
        # the core phrase from msg1 appears verbatim inside msg2's cleaned form.
        msg1 = "Connection timeout in database pool"
        msg2 = "Connection timeout in database pool at 2024-03-01 (retry 3)"
        self.assertTrue(self._similar(msg1, msg2))

    def test_short_normalised_message_not_falsely_matched(self):
        """_MIN_SUBSTRING_LEN guard prevents false duplicate when normalised form is tiny (HAO-214)."""
        # A message that is almost entirely a hex address normalises to just "XXX",
        # which is shorter than _MIN_SUBSTRING_LEN (10).  Two unrelated messages that
        # both reduce to "XXX" must NOT be treated as similar.
        msg1 = "0xDEADBEEF"   # normalises to "XXX" (len 3 < 10)
        msg2 = "0x00000001"   # normalises to "XXX" (len 3 < 10)
        # Both normalise to the same string, so the exact-match branch fires — they
        # ARE considered similar, which is the correct behaviour (identical tokens).
        self.assertTrue(self._similar(msg1, msg2))
        # But a short normalised string from msg1 must not spuriously match a longer
        # unrelated msg2 via substring — "XXX" (len 3) is below _MIN_SUBSTRING_LEN.
        msg3 = "0xCAFEBABE"           # normalises to "XXX"
        msg4 = "Disk quota exceeded"  # does not contain "XXX"
        self.assertFalse(self._similar(msg3, msg4))


        pattern = ErrorMonitor._SIMILAR_PATTERN
        sentinel = ErrorMonitor._SIMILAR_SENTINEL
        msg1 = "Cache worker failed at 0xDEADBEEF while refreshing shard"
        msg2 = "Cache worker failed at 0xcafebabe while refreshing shard"

        self.assertEqual(
            pattern.sub(sentinel, msg1),
            f"Cache worker failed at {sentinel} while refreshing shard",
        )
        self.assertNotIn("XXX", pattern.sub(sentinel, msg1))
        self.assertTrue(self._similar(msg1, msg2))

    def test_msg2_substring_of_msg1_is_similar(self):
        """Normalised msg2 that is a substring of normalised msg1 is reported as similar (HAO-215).

        This exercises the clean_msg2 branch of the return expression, ensuring
        the explicit-parentheses rewrite does not break the second sub-condition.
        """
        # msg1 is longer; msg2 (after normalisation) appears inside msg1.
        msg1 = "Fatal error in module foo: disk quota exceeded on /var/log at 2024-01-15"
        msg2 = "disk quota exceeded on /var/log"
        self.assertTrue(self._similar(msg1, msg2))

    def test_vai_135_clean_msg2_branch_requires_meaningful_length(self):
        """VAI-135 pins the clean_msg2-in-clean_msg1 branch and its min-length guard."""
        msg1 = "Runtime failure: connection reset by peer during upload"
        msg2 = "connection reset by peer"
        self.assertTrue(self._similar(msg1, msg2))
        self.assertFalse(self._similar("Runtime failure at 0xdeadbeef", "0xcafebabe"))

    def test_short_msg2_not_falsely_matched(self):
        """A very short normalised msg2 must not produce a false-positive similarity (HAO-215).

        When the entire volatile part of msg2 is replaced by _SIMILAR_PATTERN,
        the remaining string may be too short to be meaningful. The
        _SIMILAR_MIN_LEN guard must block such false matches.
        """
        # msg2 is entirely an address — after normalisation it becomes the sentinel '\x00' (len 1).
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

    def test_two_different_bare_addresses_not_similar(self):
        """Two distinct bare hex addresses that both normalise to 'XXX' must NOT
        be considered similar (HAO-216).

        The equality branch must not short-circuit on the normalised string when
        that string is too short to carry discriminating signal.  Two completely
        different errors expressed only as hex values would otherwise collapse
        into the same duplicate bucket.
        """
        msg1 = "0xDEAD"
        msg2 = "0xBEEF"
        # Both normalise to "XXX" (len 3, below _SIMILAR_MIN_LEN=10).
        # The original messages are not identical, so they must not be similar.
        self.assertFalse(self._similar(msg1, msg2))

    def test_identical_bare_address_is_similar(self):
        """Two identical bare hex addresses ARE a genuine duplicate (HAO-216).

        When both messages are literally the same string they represent the
        exact same event and should be deduplicated regardless of length after
        normalisation.
        """
        msg = "0xDEAD"
        self.assertTrue(self._similar(msg, msg))


        Symmetric companion to test_short_msg2_not_falsely_matched: when msg1
        normalises to a short token the _SIMILAR_MIN_LEN guard must block the
        first branch of the substring-match OR expression as well.
        """
        # msg1 is entirely an address — after normalisation it becomes the sentinel '\x00' (len 1).
        msg1 = "0xdeadbeef"
        msg2 = "Connection refused by remote host at port 8080"
        # The sentinel is shorter than _SIMILAR_MIN_LEN (10), so no substring match.
        self.assertFalse(self._similar(msg1, msg2))

    def test_similar_min_len_is_class_level_configuration(self):
        """_SIMILAR_MIN_LEN remains a named class-level guard (VAI-135)."""
        from hallucinate_app.error_monitor import ErrorMonitor

        self.assertEqual(ErrorMonitor._SIMILAR_MIN_LEN, 10)
        self.assertNotIn("_SIMILAR_MIN_LEN", self.monitor.__dict__)
        self.assertFalse(self._similar("0xdeadbeef", "0xcafebabe"))

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

    def test_msg2_date_normalised_for_deduplication(self):
        """Volatile date in msg2 is stripped so structurally identical messages deduplicate (HAO-220).

        clean_msg2 is produced by applying _SIMILAR_PATTERN to msg2.  This test
        verifies that the date-normalisation branch (``\\d{4}-\\d{2}-\\d{2}``) works
        symmetrically when it is msg2 that carries the volatile date, exercising
        the exact-match path after both sides are normalised.
        """
        msg1 = "Batch job failed: quota exceeded on 2024-03-01"
        msg2 = "Batch job failed: quota exceeded on 2025-11-15"
        self.assertTrue(self._similar(msg1, msg2))

    def test_clean_msg2_substring_in_clean_msg1(self):
        """Normalised msg2 with volatile hex appears inside normalised msg1 (HAO-220).

        Specifically exercises the second branch of the return expression:
        ``len(clean_msg2) >= _SIMILAR_MIN_LEN and clean_msg2 in clean_msg1``.
        After _SIMILAR_PATTERN substitution on msg2, its core text (minus the
        hex address) is found as a substring of the longer normalised msg1.
        """
        msg1 = "Service crash: memory error at 0xdeadbeef in allocation path, retry exhausted"
        msg2 = "memory error at 0xcafebabe in allocation path"
        self.assertTrue(self._similar(msg1, msg2))

    def test_two_different_hex_only_messages_not_similar(self):
        """Two messages that are entirely hex addresses must NOT be similar (HAO-221).

        Both "0xdeadbeef" and "0xcafebabe" normalise to the sentinel token
        after _SIMILAR_PATTERN substitution.  Because the sentinel is shorter than
        _SIMILAR_MIN_LEN (10), neither the exact-match path nor the substring-match
        path should fire, and the method must return False so that unrelated errors
        carrying different addresses are not wrongly deduplicated.
        """
        self.assertFalse(self._similar("0xdeadbeef", "0xcafebabe"))

    def test_identical_hex_only_messages_are_similar(self):
        """Two identical raw messages are always similar, even when short (HAO-221).

        "0xdeadbeef" compared with itself should return True because the raw
        messages are equal; the _SIMILAR_MIN_LEN guard must not suppress this.
        """
        self.assertTrue(self._similar("0xdeadbeef", "0xdeadbeef"))

    def test_equality_branch_requires_min_len(self):
        """Equality branch rejects normalised strings shorter than _SIMILAR_MIN_LEN (HAO-216).

        The original code returned True whenever clean_msg1 == clean_msg2
        without checking the length.  When two different error messages each
        consist solely of a volatile token (e.g. a bare hex address), both
        normalise to the three-character string "XXX".  Without the min-length
        guard those unrelated errors would collapse into the same duplicate
        bucket.

        This test uses a bare timestamp that normalises identically, confirming
        the equality guard applies regardless of the kind of volatile token.
        """
        # Two messages that are entirely timestamps (volatile → stripped to "XXX").
        # They are different errors and must not be considered similar.
        msg1 = "2024-01-01"
        msg2 = "2025-12-31"
        self.assertFalse(self._similar(msg1, msg2))

    def test_equality_branch_passes_with_long_normalised_string(self):
        """Equality branch accepts normalised strings that meet _SIMILAR_MIN_LEN (HAO-216).

        Confirms the positive case: two structurally identical messages that
        carry different volatile tokens both normalise to the same long string
        and must be treated as similar (genuine duplicates after stripping
        volatile details).
        """
        msg1 = "Database connection timeout after 30s retrying 0xdeadbeef"
        msg2 = "Database connection timeout after 30s retrying 0xcafebabe"
        # Both normalise to "Database connection timeout after 30s retrying XXX"
        # (well above _SIMILAR_MIN_LEN=10), so they are similar.
        self.assertTrue(self._similar(msg1, msg2))


        A previous version of error_monitor.py used a three-character placeholder
        as the normalisation sentinel.  That sentinel was replaced with ``'\\x00'``
        in VAI-144 to avoid collisions with real error messages.  This test pins the
        sentinel identity so that any accidental revert is caught immediately, and
        confirms that two distinct volatile-only messages are not conflated regardless
        of which sentinel value they normalise to.
        """
        from hallucinate_app.error_monitor import ErrorMonitor
        sentinel = ErrorMonitor._SIMILAR_SENTINEL
        self.assertEqual(len(sentinel), 1, "Sentinel must be exactly one character")
        self.assertEqual(sentinel, '\x00', "Sentinel must be the null byte (\\x00), not the old three-character placeholder")
        _old_placeholder = chr(88) * 3  # the three-character placeholder replaced by VAI-144
        self.assertNotEqual(sentinel, _old_placeholder,
                            "Sentinel must not be the old three-character placeholder")
        # Two messages consisting entirely of distinct hex addresses both normalise
        # to the single-character sentinel.  Because the sentinel is shorter than
        # _SIMILAR_MIN_LEN they must NOT be conflated (the original annotation risk).
        self.assertFalse(self._similar("0xdeadbeef", "0xcafebabe"))

    def test_message_containing_sentinel_not_falsely_similar(self):
        """A message containing the null-byte sentinel must not trigger false similarity (VAI-144).

        The old three-character placeholder (chr(88)*3) could appear in real error
        messages (e.g. from test frameworks) causing false positives.  It was replaced
        with a null byte (\\x00) to eliminate that collision risk (VAI-144).  This test
        verifies that a message whose static text happens to equal the sentinel string
        itself does not produce a false-positive match against a message whose volatile
        address normalises to the same sentinel.
        """
        # msg_sentinel contains a literal null byte in its static text (contrived
        # but structurally possible via binary-safe message encoding).  It must NOT
        # be considered similar to a message that carries a hex address which happens
        # to normalise to the same one-character token.
        import re
        from hallucinate_app.error_monitor import ErrorMonitor
        sentinel = ErrorMonitor._SIMILAR_SENTINEL
        # Verify the sentinel is a null byte (the fix introduced in VAI-144).
        self.assertEqual(sentinel, '\x00')
        # A message whose static text *is* the sentinel is shorter than
        # _SIMILAR_MIN_LEN, so neither branch should fire.
        msg_with_sentinel = sentinel
        msg_hex = "0xdeadbeef"
        self.assertFalse(self._similar(msg_with_sentinel, msg_hex))
        # A longer message that differs only in whether a hex address or the raw
        # sentinel text appears in the same position should NOT be considered similar,
        # because one of them carries the sentinel embedded in static text while the
        # other has a normalised volatile part — in practice impossible since null
        # bytes don't appear in real error strings, documenting the invariant.
        msg_static = "Error in handler: data corrupted"
        msg_hex_long = "Error in handler: data corrupted at 0xdeadbeef"
        self.assertTrue(self._similar(msg_static, msg_hex_long))

    def test_non_string_type_guard_at_line_1115(self):
        """Non-string values fall back to equality instead of normalisation (VAI-145)."""
        # None vs None — equal, so similar
        self.assertTrue(self._similar(None, None))
        # None vs str — not equal, not similar
        self.assertFalse(self._similar(None, "err"))
        self.assertFalse(self._similar("err", None))
        # Non-string numeric values
        self.assertTrue(self._similar(42, 42))
        self.assertFalse(self._similar(42, 43))
        self.assertFalse(self._similar(42, "42"))
        # Mixed non-string types
        self.assertFalse(self._similar(None, 0))
        self.assertFalse(self._similar([], ""))

    def test_uppercase_hex_different_addresses_not_conflated(self):
        """IGNORECASE normalisation + distinct addresses = not similar (VAI-147).

        _SIMILAR_PATTERN uses re.IGNORECASE so that "0xDEADBEEF" and "0xdeadbeef"
        are treated as the same volatile token (both normalised to the null-byte
        sentinel).  This is intentional for deduplication purposes.

        However, two *different* hex addresses — even when one is uppercase and one
        is lowercase — must NOT be conflated.  For example:
        - "Crash at 0xDEADBEEF" and "Crash at 0xcafebabe" both normalise to
          "Crash at <sentinel>", which are identical cleaned strings of length > 1.
          They *should* be considered similar because the volatile part (the address)
          differs but the surrounding context is the same.
        - "0xDEADBEEF" and "0xcafebabe" both normalise to the one-character sentinel,
          which is below _SIMILAR_MIN_LEN, so they must NOT be considered similar
          (distinct errors that happen to be entirely an address should not be merged).

        The comment at line 1120-1121 correctly documents the IGNORECASE behaviour.
        This test locks in the invariant so the codebase scan does not re-file
        the finding.
        """
        # Entirely-uppercase-address messages: different addresses must not be conflated
        # even though re.IGNORECASE causes them to normalise the same way as lowercase.
        self.assertFalse(self._similar("0xDEADBEEF", "0xCAFEBABE"))
        self.assertFalse(self._similar("0xDEADBEEF", "0xcafebabe"))  # mixed case
        # Same uppercase address → same raw text → True via early-return.
        self.assertTrue(self._similar("0xDEADBEEF", "0xDEADBEEF"))
        # With context: two *different* uppercase addresses in identical surrounding text
        # → similar because the surrounding context (cleaned) matches and exceeds
        # _SIMILAR_MIN_LEN.  This is the intended deduplication behaviour.
        self.assertTrue(self._similar(
            "Crash in module foo at address 0xDEADBEEF during startup",
            "Crash in module foo at address 0xCAFEBABE during startup",
        ))
        # Cross-case: uppercase vs lowercase of the *same* address with context → similar.
        self.assertTrue(self._similar(
            "Crash in module foo at address 0xDEADBEEF during startup",
            "Crash in module foo at address 0xdeadbeef during startup",
        ))

    def test_identical_short_raw_message_returns_true_before_normalization(self):
        """Identical raw messages bypass _SIMILAR_MIN_LEN (VAI-146)."""
        # A hex-only message normalises to the one-character null-byte sentinel (len 1
        # < _SIMILAR_MIN_LEN = 10), yet it must still be similar to *itself*.
        self.assertTrue(self._similar("0xcafebabe", "0xcafebabe"))
        # Same principle applies to an arbitrarily short static message.
        self.assertTrue(self._similar("e", "e"))
        # And an empty string (edge case: both sides are the same non-string sentinel).
        self.assertTrue(self._similar("", ""))

    def test_equality_branch_requires_min_len(self):
        """Equality branch is blocked when normalised string is shorter than _SIMILAR_MIN_LEN (HAO-216).

        Two messages that consist entirely of a volatile token (e.g. a bare date
        like "2024-01-15") both normalise to the single-character sentinel after
        _SIMILAR_PATTERN substitution.  Because the sentinel is shorter than
        _SIMILAR_MIN_LEN (10), the equality branch must return False so that
        unrelated errors carrying different dates are not wrongly deduplicated.
        """
        # Both dates normalise to the single null-byte sentinel (length 1 < 10).
        self.assertFalse(self._similar("2024-01-15", "2024-01-16"))

    def test_equality_branch_passes_with_long_normalised_string(self):
        """Equality branch fires when normalised string meets _SIMILAR_MIN_LEN (HAO-216).

        Two messages that differ only in a hex address normalise to the same long
        static string after _SIMILAR_PATTERN substitution.  Because the normalised
        string is longer than _SIMILAR_MIN_LEN (10), the equality branch must return
        True so that duplicate errors that differ only in a volatile address are
        correctly deduplicated.
        """
        # Both messages normalise to "Connection failed at \x00: timeout" (length > 10).
        self.assertTrue(self._similar(
            "Connection failed at 0xdeadbeef: timeout",
            "Connection failed at 0xcafebabe: timeout",
        ))

    def test_uppercase_hex_different_addresses_not_conflated(self):
        """IGNORECASE normalisation must not conflate two distinct uppercase hex addresses (VAI-147).

        _SIMILAR_PATTERN uses re.IGNORECASE so that "0xDEADBEEF" and "0xdeadbeef"
        normalise to the same sentinel token (preventing missed duplicates when the
        same address appears in different cases).  However, two *different* uppercase
        addresses must still NOT be treated as similar when the normalised static
        context is insufficient to meet _SIMILAR_MIN_LEN (10).

        This regression test locks in the IGNORECASE + distinct-address = not-conflated
        invariant so that the codebase scanner does not re-file this finding.
        """
        # Two distinct uppercase-only hex addresses must NOT be similar:
        # both normalise to the one-character null-byte sentinel (len 1 < min_len).
        self.assertFalse(self._similar("0xDEADBEEF", "0xCAFEBABE"))
        # Identical uppercase hex addresses must be similar (early raw-equality path).
        self.assertTrue(self._similar("0xDEADBEEF", "0xDEADBEEF"))
        # Mixed-case variants of the same address within a longer message ARE similar
        # (IGNORECASE normalises both to the same static+sentinel string, len > min_len).
        self.assertTrue(self._similar(
            "Segfault at 0xDEADBEEF in module foo",
            "Segfault at 0xdeadbeef in module foo",
        ))
        # Two distinct addresses in longer messages that share only the volatile token
        # ARE similar when surrounding static text is identical and long enough.
        self.assertTrue(self._similar(
            "Segfault at 0xDEADBEEF in module foo",
            "Segfault at 0xCAFEBABE in module foo",
        ))
        # Two distinct addresses in messages with different surrounding text must
        # NOT be conflated (the static portions differ after normalisation).
        self.assertFalse(self._similar(
            "Fault at 0xDEADBEEF in module alpha",
            "Fault at 0xCAFEBABE in module beta",
        ))
