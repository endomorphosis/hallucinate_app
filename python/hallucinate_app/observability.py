"""
Observability module for IPFS Kit integration

This module provides comprehensive monitoring capabilities for ipfs_kit_py
integration with Prometheus metrics, logging, and Grafana dashboard support.
It follows the monitoring architecture from ipfs_datasets_py with adaptations
for ipfs_kit_py and hallucinate_app.
"""

import os
import sys
import time
import json
import logging
import threading
import functools
import traceback
from typing import Dict, Any, List, Union, Optional, Callable, Type, TypeVar
from enum import Enum, auto
from contextlib import contextmanager
from dataclasses import dataclass, field

# Import prometheus_client if available
try:
    import prometheus_client
    from prometheus_client import Counter, Gauge, Histogram, Summary
    HAS_PROMETHEUS = True
except ImportError:
    HAS_PROMETHEUS = False
    # Create mock classes for prometheus types
    class Counter:
        def __init__(self, *args, **kwargs):
            self.value = 0
        def inc(self, amount=1):
            self.value += amount
        def labels(self, **kwargs):
            return self
    
    class Gauge:
        def __init__(self, *args, **kwargs):
            self.value = 0
        def inc(self, amount=1):
            self.value += amount
        def dec(self, amount=1):
            self.value -= amount
        def set(self, value):
            self.value = value
        def labels(self, **kwargs):
            return self
    
    class Histogram:
        def __init__(self, *args, **kwargs):
            self.values = []
        def observe(self, value):
            self.values.append(value)
        def labels(self, **kwargs):
            return self
    
    class Summary(Histogram):
        pass

# Import structlog if available
try:
    import structlog
    HAS_STRUCTLOG = True
except ImportError:
    HAS_STRUCTLOG = False
    # Create a mock structlog
    class MockStructLogger:
        def __init__(self, *args, **kwargs):
            pass
        
        def __getattr__(self, name):
            return lambda *args, **kwargs: None
    
    structlog = type('structlog', (), {
        'get_logger': lambda *args, **kwargs: MockStructLogger()
    })

# Optional imports for system metrics
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Set up basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# Type variables for generic method signatures
T = TypeVar('T')
R = TypeVar('R')

class MetricType(Enum):
    """Enum of supported metric types"""
    COUNTER = auto()
    GAUGE = auto()
    HISTOGRAM = auto()
    SUMMARY = auto()
    TIMER = auto()  # Special case, implemented as a Histogram

@dataclass
class MetricDef:
    """Definition of a metric"""
    name: str
    type: MetricType
    description: str
    labels: List[str] = field(default_factory=list)
    buckets: Optional[List[float]] = None  # For histograms
    unit: Optional[str] = None
    namespace: Optional[str] = None
    subsystem: Optional[str] = None

class ObservabilityManager:
    """
    Manager for observability features
    
    This class provides metrics, logging, and tracing functionality for
    monitoring ipfs_kit_py integration with hallucinate_app.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize the observability manager
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {}
        self.logger = self._init_logger()
        self.metrics = self._init_metrics()
        self.started = False
        self.start_time = time.time()
        
        # Thread-local storage for contextual data
        self._context = threading.local()
        self._context.data = {}
        
        # Default namespace and subsystem
        self.namespace = self.config.get("namespace", "ipfs_kit")
        self.subsystem = self.config.get("subsystem", "hallucinate_app")
        
        # Store all registered metrics
        self.registered_metrics = {}
        
        # Register default metrics
        self._register_default_metrics()
        
        # Start system metrics collection if enabled
        self.collect_system_metrics = self.config.get("collect_system_metrics", True)
        if self.collect_system_metrics and HAS_PSUTIL:
            self._start_system_metrics_collector()
    
    def _init_logger(self) -> logging.Logger:
        """Initialize the logger"""
        logger_name = self.config.get("logger_name", "ipfs_kit_observability")
        
        if HAS_STRUCTLOG:
            # Configure structlog for structured logging
            structlog.configure(
                processors=[
                    # Add thread name
                    structlog.threadlocal.merge_threadlocal_context,
                    # Add timestamps
                    structlog.processors.TimeStamper(fmt="iso"),
                    # Add log level
                    structlog.stdlib.add_log_level,
                    # Format as JSON
                    structlog.processors.JSONRenderer()
                ],
                context_class=dict,
                logger_factory=structlog.stdlib.LoggerFactory(),
                wrapper_class=structlog.stdlib.BoundLogger,
                cache_logger_on_first_use=True,
            )
            
            # Get a structured logger
            return structlog.get_logger(logger_name)
        else:
            # Use standard logger if structlog is not available
            return logging.getLogger(logger_name)
    
    def _init_metrics(self) -> Dict[str, Any]:
        """Initialize the metrics registry and server"""
        if not HAS_PROMETHEUS:
            self.logger.warning("prometheus_client not available, metrics will be mocked")
            return {"registry": None, "port": None}
        
        # Create registry
        registry = prometheus_client.CollectorRegistry()
        
        # Get Prometheus configuration
        prometheus_config = self.config.get("prometheus", {})
        enable_server = prometheus_config.get("enable_server", True)
        port = prometheus_config.get("port", 9090)
        
        # Start metrics server if enabled
        if enable_server:
            try:
                prometheus_client.start_http_server(
                    port=port, 
                    registry=registry
                )
                self.logger.info(f"Started Prometheus metrics server on port {port}")
            except Exception as e:
                self.logger.error(f"Failed to start Prometheus metrics server: {e}")
                # Try a different port
                try:
                    port = 9091
                    prometheus_client.start_http_server(
                        port=port, 
                        registry=registry
                    )
                    self.logger.info(f"Started Prometheus metrics server on alternative port {port}")
                except Exception as e2:
                    self.logger.error(f"Failed to start Prometheus metrics server on alternative port: {e2}")
                    port = None
        
        return {
            "registry": registry,
            "port": port
        }
    
    def _register_default_metrics(self):
        """Register default metrics"""
        # Operation metrics
        self.register_counter(
            name="operations_total",
            description="Total number of operations performed",
            labels=["operation", "status"]
        )
        
        self.register_histogram(
            name="operation_duration_seconds",
            description="Duration of operations in seconds",
            labels=["operation"],
            buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10]
        )
        
        # Error metrics
        self.register_counter(
            name="errors_total",
            description="Total number of errors encountered",
            labels=["operation", "error_type"]
        )
        
        # IPFS metrics
        self.register_counter(
            name="ipfs_content_added_total",
            description="Total number of content items added to IPFS",
            labels=["content_type"]
        )
        
        self.register_counter(
            name="ipfs_content_retrieved_total",
            description="Total number of content items retrieved from IPFS",
            labels=["content_type"]
        )
        
        self.register_gauge(
            name="ipfs_pin_count",
            description="Number of pinned items in IPFS"
        )
        
        # Metadata index metrics
        self.register_gauge(
            name="metadata_index_entries",
            description="Number of entries in the metadata index"
        )
        
        self.register_counter(
            name="metadata_index_operations_total",
            description="Total number of operations on the metadata index",
            labels=["operation", "status"]
        )
        
        # Process metrics
        self.register_gauge(
            name="process_uptime_seconds",
            description="Process uptime in seconds"
        )
        
        # If system metrics collection is enabled
        if self.collect_system_metrics and HAS_PSUTIL:
            self.register_gauge(
                name="system_cpu_usage_percent",
                description="CPU usage percentage"
            )
            
            self.register_gauge(
                name="system_memory_usage_bytes",
                description="Memory usage in bytes"
            )
            
            self.register_gauge(
                name="system_disk_usage_bytes",
                description="Disk usage in bytes",
                labels=["path", "type"]
            )
    
    def register_counter(self, name: str, description: str, 
                        labels: List[str] = None, namespace: str = None,
                        subsystem: str = None) -> Counter:
        """
        Register a counter metric
        
        Args:
            name: Metric name
            description: Metric description
            labels: List of label names
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Prometheus Counter object
        """
        if not HAS_PROMETHEUS:
            return Counter()
        
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric definition
        metric_def = MetricDef(
            name=name,
            type=MetricType.COUNTER,
            description=description,
            labels=labels or [],
            namespace=namespace,
            subsystem=subsystem
        )
        
        # Store the definition
        metric_id = f"{namespace}_{subsystem}_{name}"
        self.registered_metrics[metric_id] = metric_def
        
        # Create the counter
        counter = Counter(
            name=name,
            documentation=description,
            labelnames=labels or [],
            namespace=namespace,
            subsystem=subsystem,
            registry=self.metrics["registry"]
        )
        
        return counter
    
    def register_gauge(self, name: str, description: str,
                      labels: List[str] = None, namespace: str = None,
                      subsystem: str = None) -> Gauge:
        """
        Register a gauge metric
        
        Args:
            name: Metric name
            description: Metric description
            labels: List of label names
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Prometheus Gauge object
        """
        if not HAS_PROMETHEUS:
            return Gauge()
        
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric definition
        metric_def = MetricDef(
            name=name,
            type=MetricType.GAUGE,
            description=description,
            labels=labels or [],
            namespace=namespace,
            subsystem=subsystem
        )
        
        # Store the definition
        metric_id = f"{namespace}_{subsystem}_{name}"
        self.registered_metrics[metric_id] = metric_def
        
        # Create the gauge
        gauge = Gauge(
            name=name,
            documentation=description,
            labelnames=labels or [],
            namespace=namespace,
            subsystem=subsystem,
            registry=self.metrics["registry"]
        )
        
        return gauge
    
    def register_histogram(self, name: str, description: str,
                          labels: List[str] = None, buckets: List[float] = None,
                          namespace: str = None, subsystem: str = None) -> Histogram:
        """
        Register a histogram metric
        
        Args:
            name: Metric name
            description: Metric description
            labels: List of label names
            buckets: List of bucket boundaries
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Prometheus Histogram object
        """
        if not HAS_PROMETHEUS:
            return Histogram()
        
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric definition
        metric_def = MetricDef(
            name=name,
            type=MetricType.HISTOGRAM,
            description=description,
            labels=labels or [],
            buckets=buckets,
            namespace=namespace,
            subsystem=subsystem
        )
        
        # Store the definition
        metric_id = f"{namespace}_{subsystem}_{name}"
        self.registered_metrics[metric_id] = metric_def
        
        # Create the histogram
        histogram = Histogram(
            name=name,
            documentation=description,
            labelnames=labels or [],
            buckets=buckets,
            namespace=namespace,
            subsystem=subsystem,
            registry=self.metrics["registry"]
        )
        
        return histogram
    
    def register_summary(self, name: str, description: str,
                         labels: List[str] = None, namespace: str = None,
                         subsystem: str = None) -> Summary:
        """
        Register a summary metric
        
        Args:
            name: Metric name
            description: Metric description
            labels: List of label names
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Prometheus Summary object
        """
        if not HAS_PROMETHEUS:
            return Summary()
        
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric definition
        metric_def = MetricDef(
            name=name,
            type=MetricType.SUMMARY,
            description=description,
            labels=labels or [],
            namespace=namespace,
            subsystem=subsystem
        )
        
        # Store the definition
        metric_id = f"{namespace}_{subsystem}_{name}"
        self.registered_metrics[metric_id] = metric_def
        
        # Create the summary
        summary = Summary(
            name=name,
            documentation=description,
            labelnames=labels or [],
            namespace=namespace,
            subsystem=subsystem,
            registry=self.metrics["registry"]
        )
        
        return summary
    
    def _start_system_metrics_collector(self):
        """Start collecting system metrics in a background thread"""
        if not HAS_PSUTIL:
            self.logger.warning("psutil not available, system metrics collection disabled")
            return
        
        # System metrics collection interval in seconds
        interval = self.config.get("system_metrics_interval", 15)
        
        # Get metric references
        cpu_gauge = self.get_metric("system_cpu_usage_percent")
        memory_gauge = self.get_metric("system_memory_usage_bytes")
        disk_gauge = self.get_metric("system_disk_usage_bytes")
        uptime_gauge = self.get_metric("process_uptime_seconds")
        
        # Define collection function
        def collect_system_metrics():
            while True:
                try:
                    # Set process uptime
                    uptime = time.time() - self.start_time
                    if uptime_gauge:
                        uptime_gauge.set(uptime)
                    
                    # CPU usage
                    cpu_percent = psutil.cpu_percent()
                    if cpu_gauge:
                        cpu_gauge.set(cpu_percent)
                    
                    # Memory usage
                    memory_info = psutil.Process().memory_info()
                    if memory_gauge:
                        memory_gauge.set(memory_info.rss)
                    
                    # Disk usage (only for the current directory)
                    disk_info = psutil.disk_usage(".")
                    if disk_gauge:
                        disk_gauge.labels(path=".", type="used").set(disk_info.used)
                        disk_gauge.labels(path=".", type="free").set(disk_info.free)
                        disk_gauge.labels(path=".", type="total").set(disk_info.total)
                    
                except Exception as e:
                    self.logger.error(f"Error collecting system metrics: {e}")
                
                # Sleep for the specified interval
                time.sleep(interval)
        
        # Start a daemon thread for metrics collection
        metrics_thread = threading.Thread(
            target=collect_system_metrics,
            daemon=True,
            name="SystemMetricsCollector"
        )
        metrics_thread.start()
        
        self.logger.info(f"System metrics collection started with interval {interval}s")
    
    def get_metric(self, name: str, namespace: str = None, subsystem: str = None):
        """
        Get a registered metric by name
        
        Args:
            name: Metric name
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Metric object or None if not found
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # For mock Prometheus client, we need to return a new instance
            if not HAS_PROMETHEUS:
                metric_def = self.registered_metrics[metric_id]
                if metric_def.type == MetricType.COUNTER:
                    return Counter()
                elif metric_def.type == MetricType.GAUGE:
                    return Gauge()
                elif metric_def.type == MetricType.HISTOGRAM:
                    return Histogram()
                elif metric_def.type == MetricType.SUMMARY:
                    return Summary()
            
            # For real Prometheus client, this would be handled by the registry
            return None
        
        return None
    
    def start(self):
        """Start the observability manager"""
        if self.started:
            return
        
        self.logger.info("Starting observability manager")
        self.started = True
        self.start_time = time.time()
        
        # Update uptime metric
        uptime_gauge = self.get_metric("process_uptime_seconds")
        if uptime_gauge:
            uptime_gauge.set(0)
    
    def inc_counter(self, name: str, amount: int = 1, labels: Dict[str, str] = None,
                   namespace: str = None, subsystem: str = None):
        """
        Increment a counter metric
        
        Args:
            name: Metric name
            amount: Amount to increment by
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # Get the counter from Prometheus registry
            counter = self.get_metric(name, namespace, subsystem)
            if counter:
                # Apply labels if provided
                if labels:
                    counter = counter.labels(**labels)
                
                # Increment counter
                counter.inc(amount)
    
    def set_gauge(self, name: str, value: float, labels: Dict[str, str] = None,
                 namespace: str = None, subsystem: str = None):
        """
        Set a gauge metric
        
        Args:
            name: Metric name
            value: Value to set
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # Get the gauge from Prometheus registry
            gauge = self.get_metric(name, namespace, subsystem)
            if gauge:
                # Apply labels if provided
                if labels:
                    gauge = gauge.labels(**labels)
                
                # Set gauge value
                gauge.set(value)
    
    def inc_gauge(self, name: str, amount: float = 1, labels: Dict[str, str] = None,
                 namespace: str = None, subsystem: str = None):
        """
        Increment a gauge metric
        
        Args:
            name: Metric name
            amount: Amount to increment by
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # Get the gauge from Prometheus registry
            gauge = self.get_metric(name, namespace, subsystem)
            if gauge:
                # Apply labels if provided
                if labels:
                    gauge = gauge.labels(**labels)
                
                # Increment gauge
                gauge.inc(amount)
    
    def dec_gauge(self, name: str, amount: float = 1, labels: Dict[str, str] = None,
                 namespace: str = None, subsystem: str = None):
        """
        Decrement a gauge metric
        
        Args:
            name: Metric name
            amount: Amount to decrement by
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # Get the gauge from Prometheus registry
            gauge = self.get_metric(name, namespace, subsystem)
            if gauge:
                # Apply labels if provided
                if labels:
                    gauge = gauge.labels(**labels)
                
                # Decrement gauge
                gauge.dec(amount)
    
    def observe_histogram(self, name: str, value: float, labels: Dict[str, str] = None,
                         namespace: str = None, subsystem: str = None):
        """
        Observe a value for a histogram metric
        
        Args:
            name: Metric name
            value: Value to observe
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Create metric ID
        metric_id = f"{namespace}_{subsystem}_{name}"
        
        # Check if metric exists in registry
        if metric_id in self.registered_metrics:
            # Get the histogram from Prometheus registry
            histogram = self.get_metric(name, namespace, subsystem)
            if histogram:
                # Apply labels if provided
                if labels:
                    histogram = histogram.labels(**labels)
                
                # Observe value
                histogram.observe(value)
    
    @contextmanager
    def timer(self, name: str, labels: Dict[str, str] = None,
             namespace: str = None, subsystem: str = None):
        """
        Timer context manager for measuring operation duration
        
        Args:
            name: Metric name
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Yields:
            Timer context
        """
        # Use default namespace and subsystem if not provided
        namespace = namespace or self.namespace
        subsystem = subsystem or self.subsystem
        
        # Start timing
        start_time = time.time()
        
        # Create a context object for the timer
        timer_ctx = {"start_time": start_time, "name": name, "labels": labels}
        
        try:
            # Yield the timer context
            yield timer_ctx
        finally:
            # Calculate duration
            duration = time.time() - start_time
            
            # Observe duration in operation_duration_seconds histogram
            self.observe_histogram(
                name="operation_duration_seconds",
                value=duration,
                labels={"operation": name} if not labels else {**labels, "operation": name},
                namespace=namespace,
                subsystem=subsystem
            )
    
    def timed(self, name: str, labels: Dict[str, str] = None,
             namespace: str = None, subsystem: str = None):
        """
        Decorator for timing functions
        
        Args:
            name: Metric name (defaults to function name)
            labels: Label values
            namespace: Metric namespace (defaults to class namespace)
            subsystem: Metric subsystem (defaults to class subsystem)
            
        Returns:
            Decorated function
        """
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Use function name if name not provided
                metric_name = name or func.__name__
                
                with self.timer(metric_name, labels, namespace, subsystem):
                    return func(*args, **kwargs)
            return wrapper
        return decorator
    
    def track_operation(self, name: str, status: str = "success"):
        """
        Track an operation in metrics
        
        Args:
            name: Operation name
            status: Operation status
        """
        # Increment operations_total counter
        self.inc_counter(
            name="operations_total",
            labels={"operation": name, "status": status}
        )
    
    def track_error(self, operation: str, error_type: str):
        """
        Track an error in metrics
        
        Args:
            operation: Operation name
            error_type: Error type
        """
        # Increment errors_total counter
        self.inc_counter(
            name="errors_total",
            labels={"operation": operation, "error_type": error_type}
        )
        
        # Track operation with error status
        self.track_operation(operation, status="error")
    
    def log(self, level: str, message: str, **kwargs):
        """
        Log a message with structured data
        
        Args:
            level: Log level
            message: Log message
            **kwargs: Additional structured data
        """
        # Add thread-local context to kwargs
        context_data = self.get_context_data()
        if context_data:
            kwargs.update(context_data)
        
        # Log with structlog if available
        if HAS_STRUCTLOG:
            # Get the appropriate logging method
            log_method = getattr(self.logger, level.lower(), self.logger.info)
            log_method(message, **kwargs)
        else:
            # Use standard logging
            log_level = getattr(logging, level.upper(), logging.INFO)
            
            # Format kwargs as JSON
            kwargs_str = json.dumps(kwargs) if kwargs else ""
            
            # Log message with kwargs
            self.logger.log(log_level, f"{message} {kwargs_str}")
    
    def info(self, message: str, **kwargs):
        """Log an info message"""
        self.log("info", message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log a warning message"""
        self.log("warning", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log an error message"""
        self.log("error", message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log a debug message"""
        self.log("debug", message, **kwargs)
    
    def set_context(self, **kwargs):
        """
        Set context data for the current thread
        
        Args:
            **kwargs: Context data
        """
        # Initialize thread-local context if not yet done
        if not hasattr(self._context, "data"):
            self._context.data = {}
        
        # Update context with new data
        self._context.data.update(kwargs)
    
    def clear_context(self):
        """Clear context data for the current thread"""
        self._context.data = {}
    
    def get_context_data(self) -> Dict[str, Any]:
        """
        Get context data for the current thread
        
        Returns:
            Thread-local context data
        """
        if not hasattr(self._context, "data"):
            self._context.data = {}
        
        return self._context.data.copy()
    
    @contextmanager
    def context(self, **kwargs):
        """
        Context manager for setting temporary context data
        
        Args:
            **kwargs: Context data
            
        Yields:
            Current context data
        """
        # Save original context
        original_context = self.get_context_data()
        
        try:
            # Set new context
            self.set_context(**kwargs)
            
            # Yield current context
            yield self.get_context_data()
        finally:
            # Restore original context
            self.clear_context()
            self.set_context(**original_context)
    
    def stop(self):
        """Stop the observability manager"""
        if not self.started:
            return
        
        self.logger.info("Stopping observability manager")
        self.started = False


# Global observability manager instance
_observability_manager = None

def init_observability(config: Dict[str, Any] = None) -> ObservabilityManager:
    """
    Initialize the global observability manager
    
    Args:
        config: Configuration dictionary
        
    Returns:
        Observability manager instance
    """
    global _observability_manager
    
    if _observability_manager is None:
        _observability_manager = ObservabilityManager(config)
        _observability_manager.start()
    
    return _observability_manager

def get_observability() -> ObservabilityManager:
    """
    Get the global observability manager
    
    Returns:
        Observability manager instance
    """
    global _observability_manager
    
    if _observability_manager is None:
        _observability_manager = init_observability()
    
    return _observability_manager


# Convenience exports for direct use
timer = lambda *args, **kwargs: get_observability().timer(*args, **kwargs)
timed = lambda *args, **kwargs: get_observability().timed(*args, **kwargs)
track_operation = lambda *args, **kwargs: get_observability().track_operation(*args, **kwargs)
track_error = lambda *args, **kwargs: get_observability().track_error(*args, **kwargs)
info = lambda *args, **kwargs: get_observability().info(*args, **kwargs)
warning = lambda *args, **kwargs: get_observability().warning(*args, **kwargs)
error = lambda *args, **kwargs: get_observability().error(*args, **kwargs)
debug = lambda *args, **kwargs: get_observability().debug(*args, **kwargs)
set_context = lambda **kwargs: get_observability().set_context(**kwargs)
context = lambda **kwargs: get_observability().context(**kwargs)