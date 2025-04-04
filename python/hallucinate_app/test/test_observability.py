"""
Tests for the observability module
"""

import os
import sys
import json
import time
import unittest
import threading
from unittest import mock
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))

# Import observability module
from hallucinate_app.observability import (
    init_observability, get_observability, ObservabilityManager,
    timer, timed, track_operation, track_error,
    info, warning, error, debug, set_context, context
)


class TestObservability(unittest.TestCase):
    """Test suite for the observability module"""
    
    def setUp(self):
        """Set up test environment"""
        # Reset global observability manager
        global _observability_manager
        from hallucinate_app.observability import _observability_manager
        _observability_manager = None
        
        # Create test configuration
        self.config = {
            "namespace": "test",
            "subsystem": "unittest",
            "logger_name": "test_observability",
            "collect_system_metrics": False,
            "prometheus": {
                "enable_server": False
            }
        }
        
        # Initialize observability
        self.obs = init_observability(self.config)
    
    def tearDown(self):
        """Clean up after tests"""
        if self.obs:
            self.obs.stop()
    
    def test_init(self):
        """Test initialization of observability manager"""
        # Check that manager is initialized
        self.assertTrue(self.obs.initialized)
        self.assertEqual(self.obs.namespace, "test")
        self.assertEqual(self.obs.subsystem, "unittest")
    
    def test_singleton(self):
        """Test that get_observability returns the same instance"""
        # Get observability manager
        obs1 = get_observability()
        obs2 = get_observability()
        
        # Check that they are the same instance
        self.assertIs(obs1, obs2)
        self.assertIs(obs1, self.obs)
    
    def test_metrics_registration(self):
        """Test registration of metrics"""
        # Register metrics
        counter = self.obs.register_counter(
            name="test_counter",
            description="Test counter",
            labels=["label1", "label2"]
        )
        
        gauge = self.obs.register_gauge(
            name="test_gauge",
            description="Test gauge"
        )
        
        histogram = self.obs.register_histogram(
            name="test_histogram",
            description="Test histogram",
            buckets=[0.1, 0.5, 1.0, 5.0]
        )
        
        # Check that metrics are registered
        self.assertIn("test_unittest_test_counter", self.obs.registered_metrics)
        self.assertIn("test_unittest_test_gauge", self.obs.registered_metrics)
        self.assertIn("test_unittest_test_histogram", self.obs.registered_metrics)
    
    @mock.patch("hallucinate_app.observability.Counter")
    def test_counter_inc(self, mock_counter):
        """Test incrementing a counter"""
        # Mock counter instance
        mock_counter_instance = mock.MagicMock()
        mock_counter.return_value = mock_counter_instance
        
        # Register counter
        counter = self.obs.register_counter(
            name="test_counter",
            description="Test counter"
        )
        
        # Increment counter
        self.obs.inc_counter("test_counter")
        
        # Check that counter was incremented
        mock_counter_instance.inc.assert_called_once_with(1)
    
    @mock.patch("hallucinate_app.observability.Gauge")
    def test_gauge_set(self, mock_gauge):
        """Test setting a gauge"""
        # Mock gauge instance
        mock_gauge_instance = mock.MagicMock()
        mock_gauge.return_value = mock_gauge_instance
        
        # Register gauge
        gauge = self.obs.register_gauge(
            name="test_gauge",
            description="Test gauge"
        )
        
        # Set gauge value
        self.obs.set_gauge("test_gauge", 42)
        
        # Check that gauge was set
        mock_gauge_instance.set.assert_called_once_with(42)
    
    @mock.patch("hallucinate_app.observability.Histogram")
    def test_histogram_observe(self, mock_histogram):
        """Test observing a histogram"""
        # Mock histogram instance
        mock_histogram_instance = mock.MagicMock()
        mock_histogram.return_value = mock_histogram_instance
        
        # Register histogram
        histogram = self.obs.register_histogram(
            name="test_histogram",
            description="Test histogram"
        )
        
        # Observe histogram value
        self.obs.observe_histogram("test_histogram", 0.5)
        
        # Check that histogram value was observed
        mock_histogram_instance.observe.assert_called_once_with(0.5)
    
    def test_timer_context(self):
        """Test timer context manager"""
        # Mock observe_histogram
        self.obs.observe_histogram = mock.MagicMock()
        
        # Use timer context
        with self.obs.timer("test_operation"):
            time.sleep(0.1)
        
        # Check that histogram was observed
        self.obs.observe_histogram.assert_called_once()
        
        # Check that the first arg is the correct metric name
        self.assertEqual(self.obs.observe_histogram.call_args[0][0], "operation_duration_seconds")
        
        # Check that the value is a positive number
        self.assertGreater(self.obs.observe_histogram.call_args[0][1], 0)
        
        # Check that the operation label is set
        self.assertEqual(
            self.obs.observe_histogram.call_args[1]["labels"], 
            {"operation": "test_operation"}
        )
    
    def test_timed_decorator(self):
        """Test timed decorator"""
        # Mock timer context
        mock_timer = mock.MagicMock()
        mock_timer.__enter__ = mock.MagicMock(return_value=None)
        mock_timer.__exit__ = mock.MagicMock(return_value=None)
        self.obs.timer = mock.MagicMock(return_value=mock_timer)
        
        # Define a timed function
        @self.obs.timed("test_function")
        def test_func(x, y):
            return x + y
        
        # Call the function
        result = test_func(1, 2)
        
        # Check that timer was used
        self.obs.timer.assert_called_once_with("test_function", None, None, None)
        mock_timer.__enter__.assert_called_once()
        mock_timer.__exit__.assert_called_once()
        
        # Check that function returned correct result
        self.assertEqual(result, 3)
    
    def test_track_operation(self):
        """Test tracking an operation"""
        # Mock inc_counter
        self.obs.inc_counter = mock.MagicMock()
        
        # Track an operation
        self.obs.track_operation("test_operation", "success")
        
        # Check that counter was incremented
        self.obs.inc_counter.assert_called_once_with(
            name="operations_total",
            labels={"operation": "test_operation", "status": "success"}
        )
    
    def test_track_error(self):
        """Test tracking an error"""
        # Mock inc_counter and track_operation
        self.obs.inc_counter = mock.MagicMock()
        self.obs.track_operation = mock.MagicMock()
        
        # Track an error
        self.obs.track_error("test_operation", "test_error")
        
        # Check that counter was incremented
        self.obs.inc_counter.assert_called_once_with(
            name="errors_total",
            labels={"operation": "test_operation", "error_type": "test_error"}
        )
        
        # Check that operation was tracked
        self.obs.track_operation.assert_called_once_with("test_operation", status="error")
    
    def test_context_management(self):
        """Test context management"""
        # Set context
        self.obs.set_context(key1="value1", key2="value2")
        
        # Check context values
        context_data = self.obs.get_context_data()
        self.assertEqual(context_data["key1"], "value1")
        self.assertEqual(context_data["key2"], "value2")
        
        # Use context manager
        with self.obs.context(key3="value3"):
            # Check context within manager
            context_data = self.obs.get_context_data()
            self.assertEqual(context_data["key1"], "value1")
            self.assertEqual(context_data["key2"], "value2")
            self.assertEqual(context_data["key3"], "value3")
        
        # Check context after manager
        context_data = self.obs.get_context_data()
        self.assertEqual(context_data["key1"], "value1")
        self.assertEqual(context_data["key2"], "value2")
        self.assertNotIn("key3", context_data)
        
        # Clear context
        self.obs.clear_context()
        
        # Check that context is empty
        context_data = self.obs.get_context_data()
        self.assertEqual(context_data, {})
    
    def test_logging(self):
        """Test logging functions"""
        # Mock logger
        self.obs.logger = mock.MagicMock()
        
        # Set context
        self.obs.set_context(context_key="context_value")
        
        # Log at different levels
        self.obs.info("Info message", key1="value1")
        self.obs.warning("Warning message", key2="value2")
        self.obs.error("Error message", key3="value3")
        self.obs.debug("Debug message", key4="value4")
        
        # Check that logger methods were called
        self.obs.logger.info.assert_called_with("Info message", key1="value1", context_key="context_value")
        self.obs.logger.warning.assert_called_with("Warning message", key2="value2", context_key="context_value")
        self.obs.logger.error.assert_called_with("Error message", key3="value3", context_key="context_value")
        self.obs.logger.debug.assert_called_with("Debug message", key4="value4", context_key="context_value")
    
    def test_thread_local_context(self):
        """Test that context is thread-local"""
        # Set context in main thread
        self.obs.set_context(main_thread="value")
        
        # Thread function that sets its own context
        def thread_func():
            # Set context in worker thread
            self.obs.set_context(worker_thread="value")
            
            # Get context in worker thread
            worker_context = self.obs.get_context_data()
            
            # Check that worker thread only has its own context
            self.assertEqual(worker_context, {"worker_thread": "value"})
        
        # Create and start a worker thread
        worker = threading.Thread(target=thread_func)
        worker.start()
        worker.join()
        
        # Check that main thread only has its own context
        main_context = self.obs.get_context_data()
        self.assertEqual(main_context, {"main_thread": "value"})


if __name__ == "__main__":
    unittest.main()