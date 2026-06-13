"""
Error Monitoring System

Provides real-time monitoring and analysis of errors across the application.
Integrates with PyArrow Content Index and other components to provide
comprehensive error tracking, alerting, and recovery.
"""

import os
import re
import sys
import json
import logging
import time
import datetime
import asyncio
import threading
import traceback
from typing import Dict, List, Optional, Set, Tuple, Any, Callable
from enum import Enum
from collections import defaultdict, deque
from dataclasses import dataclass, field, asdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("error_monitor")

# GitHub reporter will be imported lazily to avoid circular imports
GITHUB_REPORTER_AVAILABLE = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("error_monitor")

class ErrorLevel(str, Enum):
    """Error severity levels"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    FATAL = "fatal"

class ErrorSource(str, Enum):
    """Sources of errors"""
    PYTHON = "python"
    JAVASCRIPT = "js-bridge"
    ELECTRON = "electron"
    IPFS = "ipfs"
    DATABASE = "database"
    CONTENT_INDEX = "content_index"
    MODEL = "model"
    DATASET = "dataset"
    UNKNOWN = "unknown"

@dataclass
class RecoveryStrategy:
    """Recovery strategy for an error"""
    name: str  # Name of the strategy
    description: str  # Description of what the strategy does
    method_name: str  # Name of the method to call for recovery
    is_automatic: bool = False  # Whether the strategy can be applied automatically
    parameters: Dict[str, Any] = field(default_factory=dict)  # Parameters for the recovery method

@dataclass
class ErrorData:
    """Structured error information"""
    id: str  # Unique error identifier
    timestamp: str  # ISO format timestamp
    level: ErrorLevel  # Error severity
    source: ErrorSource  # Error source
    component: str  # Specific component (e.g., "PyArrowContentIndex")
    operation: str  # Operation that caused the error
    message: str  # Error message
    details: Dict[str, Any] = field(default_factory=dict)  # Additional error details
    stack_trace: Optional[str] = None  # Stack trace if available
    count: int = 1  # Number of times this error has occurred
    first_seen: Optional[str] = None  # When this error was first seen
    last_seen: Optional[str] = None  # When this error was last seen
    resolved: bool = False  # Whether this error has been resolved
    resolution_info: Optional[Dict[str, Any]] = None  # Information about resolution
    related_errors: List[str] = field(default_factory=list)  # IDs of related errors
    user_notes: Optional[str] = None  # User-provided notes about this error
    metadata: Dict[str, Any] = field(default_factory=dict)  # Additional metadata about the error
    tags: List[str] = field(default_factory=list)  # Tags for categorization
    recovery_strategies: List[RecoveryStrategy] = field(default_factory=list)  # Available recovery strategies
    
    def __post_init__(self):
        """Initialize derived fields after construction"""
        now = datetime.datetime.now().isoformat()
        self.first_seen = self.first_seen or now
        self.last_seen = self.last_seen or now
    
    def update_occurrence(self):
        """Update occurrence information when the error happens again"""
        self.count += 1
        self.last_seen = datetime.datetime.now().isoformat()
        self.resolved = False  # Mark as unresolved if it occurs again
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ErrorData':
        """Create an ErrorData instance from a dictionary"""
        # Convert string enums back to enum types
        if 'level' in data and isinstance(data['level'], str):
            data['level'] = ErrorLevel(data['level'])
        if 'source' in data and isinstance(data['source'], str):
            try:
                data['source'] = ErrorSource(data['source'])
            except ValueError:
                data['source'] = ErrorSource.UNKNOWN
        
        # Handle recovery strategies if present
        if 'recovery_strategies' in data and isinstance(data['recovery_strategies'], list):
            strategies = []
            for strategy_data in data['recovery_strategies']:
                if isinstance(strategy_data, dict):
                    strategies.append(RecoveryStrategy(**strategy_data))
            data['recovery_strategies'] = strategies
            
        return cls(**data)
    
    @classmethod
    def from_exception(cls, exception: Exception, component: str, operation: str,
                       source: ErrorSource = ErrorSource.PYTHON, 
                       level: ErrorLevel = ErrorLevel.ERROR,
                       details: Dict[str, Any] = None) -> 'ErrorData':
        """Create an ErrorData instance from an exception"""
        import uuid
        
        stack_trace = traceback.format_exc()
        message = str(exception)
        error_type = exception.__class__.__name__
        
        # Create basic tags
        tags = [component.lower(), source.value, level.value]
        
        # Add error type tag
        tags.append(error_type.lower())
        
        return cls(
            id=str(uuid.uuid4()),
            timestamp=datetime.datetime.now().isoformat(),
            level=level,
            source=source,
            component=component,
            operation=operation,
            message=f"{error_type}: {message}",
            details=details or {},
            stack_trace=stack_trace,
            tags=tags,
            metadata={
                "error_type": error_type,
                "python_version": sys.version,
                "platform": sys.platform
            }
        )

class ErrorAnalyzer:
    """Analyzes errors to detect patterns and provide insights"""
    
    def __init__(self):
        self.error_counts = defaultdict(int)  # Counts by error type
        self.source_counts = defaultdict(int)  # Counts by source
        self.component_counts = defaultdict(int)  # Counts by component
        self.error_timeline = []  # Errors by time
        self.frequent_patterns = []  # Frequently occurring error patterns
        
        # Time windows for analysis
        self.last_hour = []
        self.last_day = []
        self.last_week = []
    
    def add_error(self, error: ErrorData):
        """Add an error to the analyzer"""
        # Update counts
        message_key = error.message[:100]  # Use first 100 chars as key
        self.error_counts[message_key] += 1
        self.source_counts[error.source] += 1
        self.component_counts[error.component] += 1
        
        # Add to timeline
        self.error_timeline.append((error.timestamp, error.id))
        
        # Update time windows
        now = datetime.datetime.now()
        error_time = datetime.datetime.fromisoformat(error.timestamp)
        
        if (now - error_time).total_seconds() < 3600:  # Last hour
            self.last_hour.append(error.id)
        
        if (now - error_time).total_seconds() < 86400:  # Last day
            self.last_day.append(error.id)
            
        if (now - error_time).total_seconds() < 604800:  # Last week
            self.last_week.append(error.id)
        
        # Analyze for patterns if we have enough errors
        if len(self.error_timeline) % 10 == 0:
            self._analyze_patterns()
    
    def _analyze_patterns(self):
        """Analyze errors for patterns"""
        # Simple analysis: find error types that occur close together in time
        if len(self.error_timeline) < 5:
            return
        
        patterns = []
        window_size = 5
        
        for i in range(len(self.error_timeline) - window_size):
            window = self.error_timeline[i:i+window_size]
            # Check time difference between first and last error in window
            first_time = datetime.datetime.fromisoformat(window[0][0])
            last_time = datetime.datetime.fromisoformat(window[-1][0])
            if (last_time - first_time).total_seconds() < 60:  # Errors within 1 minute
                pattern = [error_id for _, error_id in window]
                patterns.append(pattern)
        
        # Store frequent patterns
        if patterns:
            self.frequent_patterns = patterns[-5:]  # Keep the 5 most recent patterns
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of error analysis"""
        # Get top errors
        top_errors = sorted(self.error_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        top_sources = sorted(self.source_counts.items(), key=lambda x: x[1], reverse=True)
        top_components = sorted(self.component_counts.items(), key=lambda x: x[1], reverse=True)
        
        # Calculate trends
        hour_rate = len(self.last_hour)
        day_rate = len(self.last_day) / 24 if len(self.last_day) > 0 else 0
        week_rate = len(self.last_week) / 168 if len(self.last_week) > 0 else 0
        
        return {
            "total_errors": sum(self.error_counts.values()),
            "top_errors": [{"message": msg, "count": count} for msg, count in top_errors],
            "by_source": [{"source": src, "count": count} for src, count in top_sources],
            "by_component": [{"component": comp, "count": count} for comp, count in top_components],
            "error_rates": {
                "hourly": hour_rate,
                "daily_avg": day_rate,
                "weekly_avg": week_rate
            },
            "patterns_detected": len(self.frequent_patterns),
            "most_active_time": self._find_most_active_time(),
        }
    
    def _find_most_active_time(self) -> Dict[str, Any]:
        """Find the time period with the most errors"""
        if not self.error_timeline:
            return {"hour": None, "count": 0}
        
        # Group by hour
        hour_counts = defaultdict(int)
        for timestamp, _ in self.error_timeline:
            dt = datetime.datetime.fromisoformat(timestamp)
            hour = dt.hour
            hour_counts[hour] += 1
        
        # Find the hour with the most errors
        most_active_hour, count = max(hour_counts.items(), key=lambda x: x[1], default=(None, 0))
        
        return {
            "hour": most_active_hour,
            "count": count
        }

class ErrorRecoveryStrategy:
    """Base class for error recovery strategies"""
    
    def __init__(self, name: str):
        self.name = name
    
    async def can_recover(self, error: ErrorData) -> bool:
        """Check if this strategy can recover from the error"""
        return False
    
    async def recover(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """
        Attempt to recover from the error
        
        Returns:
            (success, recovery_info)
        """
        return False, {"strategy": self.name, "message": "Not implemented"}

class ContentIndexRecoveryStrategy(ErrorRecoveryStrategy):
    """Recovery strategy for PyArrow Content Index errors"""
    
    def __init__(self, resources=None):
        super().__init__("content_index_recovery")
        self.resources = resources or {}
    
    async def can_recover(self, error: ErrorData) -> bool:
        """Check if this strategy can recover from the error"""
        if error.source != ErrorSource.CONTENT_INDEX:
            return False
        
        # Check if it's a known recoverable error
        if "table corruption" in error.message.lower():
            return True
        if "index out of sync" in error.message.lower():
            return True
        if "pyarrow" in error.message.lower() and "memory" in error.message.lower():
            return True
        
        return False
    
    async def recover(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """Attempt to recover from the error"""
        # Get the content index from resources
        content_index = self.resources.get('pyarrow_content_index')
        if not content_index:
            return False, {
                "strategy": self.name,
                "message": "Content index not available in resources"
            }
        
        recovery_info = {
            "strategy": self.name,
            "error_id": error.id,
            "actions_taken": []
        }
        
        try:
            # Table corruption recovery
            if "table corruption" in error.message.lower():
                # Reload the table from backup
                backup_path = content_index.index_path + ".bak"
                if os.path.exists(backup_path):
                    recovery_info["actions_taken"].append("Restoring from backup")
                    content_index.table = None  # Clear the corrupted table
                    # Load from backup
                    content_index.index_path = backup_path
                    await content_index._load_table()
                    # Restore original path
                    content_index.index_path = backup_path.replace(".bak", "")
                    # Save to original path
                    await content_index.save()
                    recovery_info["actions_taken"].append("Rebuilt table from backup")
                    return True, recovery_info
                else:
                    # Rebuild the table from scratch
                    recovery_info["actions_taken"].append("No backup found, rebuilding table")
                    content_index.table = None
                    await content_index._load_table()  # This will create a new empty table
                    recovery_info["actions_taken"].append("Created new empty table")
                    return True, recovery_info
            
            # Index out of sync recovery
            elif "index out of sync" in error.message.lower():
                recovery_info["actions_taken"].append("Rebuilding indexes")
                content_index._build_indexes()
                recovery_info["actions_taken"].append("Indexes rebuilt")
                return True, recovery_info
            
            # Memory error recovery
            elif "pyarrow" in error.message.lower() and "memory" in error.message.lower():
                recovery_info["actions_taken"].append("Clearing memory and reloading")
                content_index.table = None
                # Force garbage collection
                import gc
                gc.collect()
                # Reload table with memory mapping
                await content_index._load_table()
                recovery_info["actions_taken"].append("Table reloaded with memory mapping")
                return True, recovery_info
            
            return False, {
                "strategy": self.name,
                "message": "No recovery action matched the error",
                "error_id": error.id
            }
        except Exception as e:
            recovery_info["error"] = str(e)
            recovery_info["stack_trace"] = traceback.format_exc()
            return False, recovery_info

class DatabaseRecoveryStrategy(ErrorRecoveryStrategy):
    """Recovery strategy for database errors"""
    
    def __init__(self, resources=None):
        super().__init__("database_recovery")
        self.resources = resources or {}
    
    async def can_recover(self, error: ErrorData) -> bool:
        """Check if this strategy can recover from the error"""
        if error.source != ErrorSource.DATABASE:
            return False
        
        # Check if it's a known recoverable error
        if "connection" in error.message.lower():
            return True
        if "timeout" in error.message.lower():
            return True
        if "lock" in error.message.lower():
            return True
        
        return False
    
    async def recover(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """Attempt to recover from the error"""
        # Get database manager from resources
        database_sync = self.resources.get('database_sync_manager')
        if not database_sync:
            return False, {
                "strategy": self.name,
                "message": "Database sync manager not available in resources"
            }
        
        recovery_info = {
            "strategy": self.name,
            "error_id": error.id,
            "actions_taken": []
        }
        
        try:
            # Connection error recovery
            if "connection" in error.message.lower():
                recovery_info["actions_taken"].append("Reconnecting to database")
                # Reconnect to database
                await database_sync.reconnect()
                recovery_info["actions_taken"].append("Database connection reestablished")
                return True, recovery_info
            
            # Timeout error recovery
            elif "timeout" in error.message.lower():
                recovery_info["actions_taken"].append("Increasing timeout and retrying")
                # Increase timeout
                database_sync.increase_timeout()
                # Retry operation
                if error.operation and error.details.get("retry_args"):
                    method = getattr(database_sync, error.operation, None)
                    if method and callable(method):
                        recovery_info["actions_taken"].append(f"Retrying operation {error.operation}")
                        args = error.details.get("retry_args", [])
                        kwargs = error.details.get("retry_kwargs", {})
                        try:
                            await method(*args, **kwargs)
                            recovery_info["actions_taken"].append("Operation completed successfully")
                            return True, recovery_info
                        except Exception as e:
                            recovery_info["retry_error"] = str(e)
                            return False, recovery_info
                
                return False, recovery_info
            
            # Lock error recovery
            elif "lock" in error.message.lower():
                recovery_info["actions_taken"].append("Waiting for lock release and retrying")
                # Wait for lock to be released
                await asyncio.sleep(2)
                # Retry operation
                if error.operation and error.details.get("retry_args"):
                    method = getattr(database_sync, error.operation, None)
                    if method and callable(method):
                        recovery_info["actions_taken"].append(f"Retrying operation {error.operation}")
                        args = error.details.get("retry_args", [])
                        kwargs = error.details.get("retry_kwargs", {})
                        try:
                            await method(*args, **kwargs)
                            recovery_info["actions_taken"].append("Operation completed successfully")
                            return True, recovery_info
                        except Exception as e:
                            recovery_info["retry_error"] = str(e)
                            return False, recovery_info
                
                return False, recovery_info
            
            return False, {
                "strategy": self.name,
                "message": "No recovery action matched the error",
                "error_id": error.id
            }
        except Exception as e:
            recovery_info["error"] = str(e)
            recovery_info["stack_trace"] = traceback.format_exc()
            return False, recovery_info

class IPFSRecoveryStrategy(ErrorRecoveryStrategy):
    """Recovery strategy for IPFS errors"""
    
    def __init__(self, resources=None):
        super().__init__("ipfs_recovery")
        self.resources = resources or {}
    
    async def can_recover(self, error: ErrorData) -> bool:
        """Check if this strategy can recover from the error"""
        if error.source != ErrorSource.IPFS:
            return False
        
        # Check if it's a known recoverable error
        if "connection" in error.message.lower():
            return True
        if "timeout" in error.message.lower():
            return True
        if "unreachable" in error.message.lower():
            return True
        
        return False
    
    async def recover(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """Attempt to recover from the error"""
        # Get IPFS client from resources
        ipfs_kit = self.resources.get('ipfs_kit')
        if not ipfs_kit:
            return False, {
                "strategy": self.name,
                "message": "IPFS kit not available in resources"
            }
        
        recovery_info = {
            "strategy": self.name,
            "error_id": error.id,
            "actions_taken": []
        }
        
        try:
            # Connection error recovery
            if "connection" in error.message.lower() or "unreachable" in error.message.lower():
                recovery_info["actions_taken"].append("Reconnecting to IPFS node")
                # Reconnect to IPFS
                if hasattr(ipfs_kit, 'reconnect') and callable(ipfs_kit.reconnect):
                    await ipfs_kit.reconnect()
                    recovery_info["actions_taken"].append("IPFS connection reestablished")
                    return True, recovery_info
                else:
                    recovery_info["actions_taken"].append("No reconnect method available")
                    return False, recovery_info
            
            # Timeout error recovery
            elif "timeout" in error.message.lower():
                recovery_info["actions_taken"].append("Increasing timeout and retrying")
                # Increase timeout
                if hasattr(ipfs_kit, 'increase_timeout') and callable(ipfs_kit.increase_timeout):
                    ipfs_kit.increase_timeout()
                    recovery_info["actions_taken"].append("Timeout increased")
                
                # Retry operation
                if error.operation and error.details.get("retry_args"):
                    method = getattr(ipfs_kit, error.operation, None)
                    if method and callable(method):
                        recovery_info["actions_taken"].append(f"Retrying operation {error.operation}")
                        args = error.details.get("retry_args", [])
                        kwargs = error.details.get("retry_kwargs", {})
                        try:
                            await method(*args, **kwargs)
                            recovery_info["actions_taken"].append("Operation completed successfully")
                            return True, recovery_info
                        except Exception as e:
                            recovery_info["retry_error"] = str(e)
                            return False, recovery_info
                
                return False, recovery_info
            
            return False, {
                "strategy": self.name,
                "message": "No recovery action matched the error",
                "error_id": error.id
            }
        except Exception as e:
            recovery_info["error"] = str(e)
            recovery_info["stack_trace"] = traceback.format_exc()
            return False, recovery_info

class ErrorRecoveryManager:
    """Manages error recovery strategies and attempts automatic recovery"""
    
    def __init__(self, resources=None):
        self.resources = resources or {}
        self.strategies = []
        self.recovery_history = []
        self.max_recovery_attempts = 3  # Maximum number of recovery attempts per error
        self.recovery_attempt_counts = defaultdict(int)  # Counts attempts by error message
        
        # Add default recovery strategies
        self._add_default_strategies()
    
    def _add_default_strategies(self):
        """Add default recovery strategies"""
        self.add_strategy(ContentIndexRecoveryStrategy(self.resources))
        self.add_strategy(DatabaseRecoveryStrategy(self.resources))
        self.add_strategy(IPFSRecoveryStrategy(self.resources))
    
    def add_strategy(self, strategy: ErrorRecoveryStrategy):
        """Add a recovery strategy"""
        self.strategies.append(strategy)
    
    async def attempt_recovery(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """
        Attempt to recover from an error
        
        Args:
            error: The error to recover from
            
        Returns:
            (success, recovery_info)
        """
        # Check if we've reached the maximum attempts for this error
        error_key = error.message[:100]  # Use first 100 chars as key
        if self.recovery_attempt_counts[error_key] >= self.max_recovery_attempts:
            return False, {
                "message": f"Maximum recovery attempts reached for this error ({self.max_recovery_attempts})",
                "error_id": error.id
            }
        
        # Increment attempt count
        self.recovery_attempt_counts[error_key] += 1
        
        # Try each strategy in order
        for strategy in self.strategies:
            can_recover = await strategy.can_recover(error)
            
            if can_recover:
                success, recovery_info = await strategy.recover(error)
                
                # Record the recovery attempt
                recovery_record = {
                    "timestamp": datetime.datetime.now().isoformat(),
                    "error_id": error.id,
                    "strategy": strategy.name,
                    "success": success,
                    "attempt_number": self.recovery_attempt_counts[error_key],
                    "info": recovery_info
                }
                self.recovery_history.append(recovery_record)
                
                # If successful, mark the error as resolved
                if success:
                    error.resolved = True
                    error.resolution_info = {
                        "timestamp": datetime.datetime.now().isoformat(),
                        "strategy": strategy.name,
                        "automatic": True,
                        "details": recovery_info
                    }
                
                return success, recovery_info
        
        # No strategy could recover
        return False, {
            "message": "No recovery strategy available for this error",
            "error_id": error.id
        }
    
    def get_recovery_history(self) -> List[Dict[str, Any]]:
        """Get the recovery attempt history"""
        return self.recovery_history
    
    def reset_attempt_counts(self):
        """Reset recovery attempt counts"""
        self.recovery_attempt_counts = defaultdict(int)
    
    def reset_for_error(self, error_id: str):
        """Reset recovery attempts for a specific error"""
        for error_key in list(self.recovery_attempt_counts.keys()):
            if error_key in error_id:
                del self.recovery_attempt_counts[error_key]

class AlertRule:
    """Rule for when to trigger alerts based on errors"""
    
    def __init__(self, name: str, enabled: bool = True):
        self.name = name
        self.enabled = enabled
    
    def should_alert(self, error: ErrorData, analyzer: ErrorAnalyzer) -> bool:
        """Check if an alert should be triggered for this error"""
        return False

class FatalErrorAlertRule(AlertRule):
    """Alert on any fatal error"""
    
    def __init__(self):
        super().__init__("fatal_error_alert")
    
    def should_alert(self, error: ErrorData, analyzer: ErrorAnalyzer) -> bool:
        """Check if an alert should be triggered for this error"""
        return error.level == ErrorLevel.FATAL

class FrequencyAlertRule(AlertRule):
    """Alert when errors occur frequently"""
    
    def __init__(self, threshold: int = 5, window_seconds: int = 300):
        super().__init__("frequency_alert")
        self.threshold = threshold
        self.window_seconds = window_seconds
        self.error_times = defaultdict(list)  # Times errors occurred by type
    
    def should_alert(self, error: ErrorData, analyzer: ErrorAnalyzer) -> bool:
        """Check if an alert should be triggered for this error"""
        # Extract a key to identify similar errors
        error_key = f"{error.source}:{error.component}:{error.message[:50]}"
        
        # Get current time
        now = datetime.datetime.now()
        
        # Add this error to the history
        error_time = datetime.datetime.fromisoformat(error.timestamp)
        self.error_times[error_key].append(error_time)
        
        # Prune old errors outside the window
        self.error_times[error_key] = [
            t for t in self.error_times[error_key]
            if (now - t).total_seconds() <= self.window_seconds
        ]
        
        # Check if we've hit the threshold
        return len(self.error_times[error_key]) >= self.threshold

class ComponentOutageAlertRule(AlertRule):
    """Alert when a component appears to be experiencing an outage"""
    
    def __init__(self, error_threshold: int = 3, component_timeout: int = 600):
        super().__init__("component_outage_alert")
        self.error_threshold = error_threshold
        self.component_timeout = component_timeout
        self.component_errors = defaultdict(list)  # Errors by component
        self.alerted_components = set()  # Components we've already alerted for
    
    def should_alert(self, error: ErrorData, analyzer: ErrorAnalyzer) -> bool:
        """Check if an alert should be triggered for this error"""
        component_key = f"{error.source}:{error.component}"
        
        # If we've already alerted for this component, don't alert again
        if component_key in self.alerted_components:
            return False
        
        # Get current time
        now = datetime.datetime.now()
        
        # Add this error to the component's history
        error_time = datetime.datetime.fromisoformat(error.timestamp)
        self.component_errors[component_key].append((error_time, error.message))
        
        # Prune old errors outside the window
        self.component_errors[component_key] = [
            (t, m) for t, m in self.component_errors[component_key]
            if (now - t).total_seconds() <= self.component_timeout
        ]
        
        # Check if we've hit the threshold
        if len(self.component_errors[component_key]) >= self.error_threshold:
            self.alerted_components.add(component_key)
            return True
        
        return False
    
    def reset_component(self, component: str, source: str = None):
        """Reset the alert status for a component"""
        if source:
            component_key = f"{source}:{component}"
            if component_key in self.alerted_components:
                self.alerted_components.remove(component_key)
            self.component_errors[component_key] = []
        else:
            # Reset all keys for this component across all sources
            for key in list(self.alerted_components):
                if key.endswith(f":{component}"):
                    self.alerted_components.remove(key)
            
            for key in list(self.component_errors.keys()):
                if key.endswith(f":{component}"):
                    self.component_errors[key] = []

class ErrorMonitor:
    """
    Central error monitoring system
    
    Tracks errors across the application, analyzes patterns, attempts recovery,
    and triggers alerts when necessary.
    """

    # Compiled once; re.IGNORECASE ensures both 0xDEADBEEF and 0xdeadbeef are normalised.
    # Character classes use only lowercase ranges — re.IGNORECASE covers the uppercase
    # variants, so explicit [A-F] / [A-Fa-f] ranges are redundant and removed.
    # Keep timestamps before stack traces so "at 2026-05-28" is not consumed
    # as a partial "at file:line" token.
    _SIMILAR_PATTERN = re.compile(
        r'line \d+'
        r'|\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:z|[+-]\d{2}:?\d{2})?)?'
        r'|at (?!\d{4}-\d{2}-\d{2})[^:]+:\d+'
        r'|0x[0-9a-f]+'
        r'|ID: [a-f0-9-]+',
        re.IGNORECASE,
    )
    _SIMILAR_MIN_LEN = 10
    # Sentinel used to replace volatile details during normalisation.  A null
    # byte cannot appear in ordinary error-message strings, so it will never
    # collide with real message content and cause a false-positive similarity
    # match (VAI-144).  The sentinel is deliberately shorter than _SIMILAR_MIN_LEN
    # so that a message consisting entirely of volatile tokens normalises to a
    # string whose length falls below the minimum and is not falsely treated as
    # similar to another fully-volatile message.
    _SIMILAR_SENTINEL = '\x00'
    
    def __init__(self, resources=None, config=None):
        self.resources = resources or {}
        self.config = config or {}
        
        # Error storage
        self.errors = {}  # Errors by ID
        self.error_log_path = self.config.get(
            'error_log_path',
            os.path.join(os.path.expanduser("~"), '.hallucinate_app', 'logs', 'error_monitor.json')
        )
        
        # Analysis and recovery
        self.analyzer = ErrorAnalyzer()
        self.recovery_manager = ErrorRecoveryManager(resources)
        
        # Alert rules
        self.alert_rules = []
        self._add_default_alert_rules()
        
        # Alert handlers (functions to call when alerts are triggered)
        self.alert_handlers = []
        
        # GitHub issue reporter
        self.github_reporter = None
        if self.config.get('enable_github_reporting', False):
            # Import here to avoid circular imports
            try:
                from hallucinate_app.github_issue_reporter import get_reporter, IssueReportConfig
                global GITHUB_REPORTER_AVAILABLE
                GITHUB_REPORTER_AVAILABLE = True
                
                github_config = IssueReportConfig.from_env()
                if self.config.get('github_config'):
                    # Override with provided config
                    for key, value in self.config['github_config'].items():
                        setattr(github_config, key, value)
                self.github_reporter = get_reporter(github_config)
                logger.info("GitHub issue reporter initialized")
            except ImportError as e:
                logger.warning(f"GitHub issue reporter not available: {e}")
                GITHUB_REPORTER_AVAILABLE = False
        
        # Status tracking
        self.component_status = {}  # Status by component
        self.is_running = False
        self.processing_queue = asyncio.Queue()
        self.alert_history = []
        
        # Load existing errors if available
        self._load_errors()
    
    def _add_default_alert_rules(self):
        """Add default alert rules"""
        self.add_alert_rule(FatalErrorAlertRule())
        self.add_alert_rule(FrequencyAlertRule())
        self.add_alert_rule(ComponentOutageAlertRule())
    
    def add_alert_rule(self, rule: AlertRule):
        """Add an alert rule"""
        self.alert_rules.append(rule)
    
    def add_alert_handler(self, handler: Callable[[ErrorData, str], None]):
        """
        Add an alert handler
        
        Args:
            handler: Function that takes (error, alert_reason) and handles the alert
        """
        self.alert_handlers.append(handler)
    
    def _load_errors(self):
        """Load errors from disk"""
        try:
            if os.path.exists(self.error_log_path):
                with open(self.error_log_path, 'r') as f:
                    data = json.load(f)
                    
                    # Convert stored errors to ErrorData objects
                    for error_id, error_dict in data.get('errors', {}).items():
                        self.errors[error_id] = ErrorData.from_dict(error_dict)
                    
                    # Add to analyzer
                    for error in self.errors.values():
                        self.analyzer.add_error(error)
                    
                    logger.info(f"Loaded {len(self.errors)} errors from {self.error_log_path}")
        except Exception as e:
            logger.error(f"Failed to load errors: {e}")
    
    def _save_errors(self):
        """Save errors to disk"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.error_log_path), exist_ok=True)
            
            # Convert errors to dictionaries
            error_dicts = {
                error_id: error.to_dict()
                for error_id, error in self.errors.items()
            }
            
            # Save to file
            with open(self.error_log_path, 'w') as f:
                json.dump({
                    'timestamp': datetime.datetime.now().isoformat(),
                    'errors': error_dicts
                }, f, indent=2)
                
            logger.debug(f"Saved {len(self.errors)} errors to {self.error_log_path}")
        except Exception as e:
            logger.error(f"Failed to save errors: {e}")
    
    async def start(self):
        """Start the error monitor"""
        if self.is_running:
            return
        
        self.is_running = True
        
        # Start the processing loop
        asyncio.create_task(self._processing_loop())
        
        logger.info("Error monitor started")
    
    async def stop(self):
        """Stop the error monitor"""
        self.is_running = False
        
        # Save errors before stopping
        self._save_errors()
        
        logger.info("Error monitor stopped")
    
    async def _processing_loop(self):
        """Process errors and perform periodic maintenance"""
        while self.is_running:
            try:
                # Process any queued errors
                while not self.processing_queue.empty():
                    error_data = await self.processing_queue.get()
                    await self._process_error(error_data)
                    self.processing_queue.task_done()
                
                # Perform periodic maintenance
                self._periodic_maintenance()
                
                # Save errors periodically
                self._save_errors()
                
                # Sleep before next cycle
                await asyncio.sleep(10)  # Check every 10 seconds
            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                await asyncio.sleep(30)  # Sleep longer after an error
    
    def _periodic_maintenance(self):
        """Perform periodic maintenance tasks"""
        # Update component status
        self._update_component_status()
        
        # Clean up old alert history
        self._prune_alert_history()
    
    def _update_component_status(self):
        """Update status for all components"""
        components = set()
        
        # Collect all components from errors
        for error in self.errors.values():
            components.add((error.source, error.component))
        
        # Update status for each component
        for source, component in components:
            # Get recent errors for this component
            recent_errors = [
                e for e in self.errors.values()
                if e.source == source and e.component == component and not e.resolved
            ]
            
            # Determine status based on errors
            if not recent_errors:
                status = "healthy"
            elif any(e.level == ErrorLevel.FATAL for e in recent_errors):
                status = "critical"
            elif len(recent_errors) > 5:
                status = "degraded"
            elif len(recent_errors) > 0:
                status = "warning"
            else:
                status = "healthy"
            
            # Update status
            self.component_status[f"{source}:{component}"] = {
                "status": status,
                "error_count": len(recent_errors),
                "last_updated": datetime.datetime.now().isoformat()
            }
    
    def _prune_alert_history(self):
        """Remove old alerts from history"""
        now = datetime.datetime.now()
        max_age_days = 7  # Keep alerts for up to 7 days
        
        self.alert_history = [
            alert for alert in self.alert_history
            if (now - datetime.datetime.fromisoformat(alert['timestamp'])).days <= max_age_days
        ]
    
    async def add_error(self, error: ErrorData):
        """
        Add an error to be monitored
        
        Args:
            error: The error data
        """
        # Queue for processing
        await self.processing_queue.put(error)
    
    async def add_exception(self, exception: Exception, component: str, operation: str,
                           source: ErrorSource = ErrorSource.PYTHON,
                           level: ErrorLevel = ErrorLevel.ERROR,
                           details: Dict[str, Any] = None) -> str:
        """
        Add an exception to be monitored
        
        Args:
            exception: The exception
            component: Component where the exception occurred
            operation: Operation that caused the exception
            source: Source of the exception
            level: Severity level
            details: Additional details
            
        Returns:
            The error ID
        """
        error = ErrorData.from_exception(
            exception, component, operation, source, level, details
        )
        
        # Queue for processing
        await self.processing_queue.put(error)
        
        return error.id
    
    async def _process_error(self, error: ErrorData):
        """
        Process an error
        
        - Check if it's a duplicate
        - Add to analyzer
        - Attempt recovery
        - Check alert rules
        - Report to GitHub if configured
        """
        # Check if this is a duplicate of an existing error
        existing_id = self._find_duplicate_error(error)
        
        if existing_id:
            # Update the existing error instead of adding a new one
            self.errors[existing_id].update_occurrence()
            self.analyzer.add_error(self.errors[existing_id])
            error_to_process = self.errors[existing_id]
        else:
            # Add as a new error
            self.errors[error.id] = error
            self.analyzer.add_error(error)
            error_to_process = error
        
        # Attempt automatic recovery if not already resolved
        if not error_to_process.resolved:
            success, recovery_info = await self.recovery_manager.attempt_recovery(error_to_process)
            
            if success:
                logger.info(f"Successfully recovered from error {error_to_process.id}")
            
            # Update error with recovery attempt info
            error_to_process.details['recovery_attempted'] = True
            error_to_process.details['recovery_success'] = success
            if not error_to_process.details.get('recovery_info'):
                error_to_process.details['recovery_info'] = []
            error_to_process.details['recovery_info'].append(recovery_info)
        
        # Report to GitHub if enabled and not resolved
        if self.github_reporter and not error_to_process.resolved:
            try:
                issue_url = self.github_reporter.create_issue(error_to_process)
                if issue_url:
                    logger.info(f"Reported error {error_to_process.id} to GitHub: {issue_url}")
                    error_to_process.metadata['github_issue_url'] = issue_url
            except Exception as e:
                logger.error(f"Failed to report error to GitHub: {e}")
        
        # Check alert rules
        await self._check_alerts(error_to_process)
    
    def _find_duplicate_error(self, error: ErrorData) -> Optional[str]:
        """Find if this error is a duplicate of an existing one"""
        for existing_id, existing in self.errors.items():
            if existing_id == error.id:
                continue
            # Check if it's the same component and similar message
            if (existing.component == error.component and 
                existing.source == error.source and
                self._messages_similar(existing.message, error.message)):
                return existing_id
        
        return None
    
    def _messages_similar(self, msg1: str, msg2: str) -> bool:
        """Check if two error messages are similar"""
        # Guard: if either value is not a string (e.g. None came through at
        # runtime despite the type annotation), fall back to equality so that
        # re.sub does not raise TypeError and duplicate detection still works
        # for the common case where both sides are the same non-string value.
        if not isinstance(msg1, str) or not isinstance(msg2, str):
            return msg1 == msg2
        # Identical raw messages are always similar, regardless of length.
        if msg1 == msg2:
            return True
        # Remove volatile details (addresses, line numbers, timestamps, IDs).
        # _SIMILAR_PATTERN uses re.IGNORECASE so uppercase hex (0xDEADBEEF) is
        # also normalised, preventing missed duplicates.
        # _SIMILAR_SENTINEL uses a null byte which cannot appear in real error
        # messages, preventing false-positive matches when message text contains
        # the literal sentinel string (VAI-144).
        clean_msg1 = self._SIMILAR_PATTERN.sub(self._SIMILAR_SENTINEL, msg1)
        clean_msg2 = self._SIMILAR_PATTERN.sub(self._SIMILAR_SENTINEL, msg2)
        # Require minimum length for both exact and substring matches.  A very
        # short cleaned string (e.g. a message that was entirely a hex address
        # and became the sentinel) must not cause unrelated errors to be treated
        # as duplicates — the guard applies to the exact-match path as well as
        # the substring path so that e.g. "0xdeadbeef" and "0xcafebabe" (both
        # normalising to the one-character sentinel) are not conflated.
        # (Identical raw messages are handled by the early-return above.)
        if clean_msg1 == clean_msg2 and len(clean_msg1) >= self._SIMILAR_MIN_LEN:
            return True
        return (
            (len(clean_msg1) >= self._SIMILAR_MIN_LEN and clean_msg1 in clean_msg2)
            or (len(clean_msg2) >= self._SIMILAR_MIN_LEN and clean_msg2 in clean_msg1)
        )
    
    async def _check_alerts(self, error: ErrorData):
        """Check if any alert rules are triggered by this error"""
        for rule in self.alert_rules:
            if not rule.enabled:
                continue
                
            if rule.should_alert(error, self.analyzer):
                await self._trigger_alert(error, rule.name)
    
    async def _trigger_alert(self, error: ErrorData, rule_name: str):
        """Trigger an alert for an error"""
        # Record the alert
        alert_record = {
            "error_id": error.id,
            "rule": rule_name,
            "timestamp": datetime.datetime.now().isoformat(),
            "error_level": error.level,
            "component": error.component,
            "source": error.source,
            "message": error.message
        }
        self.alert_history.append(alert_record)
        
        # Call all alert handlers
        for handler in self.alert_handlers:
            try:
                handler(error, rule_name)
            except Exception as e:
                logger.error(f"Error in alert handler: {e}")
        
        logger.warning(f"Alert triggered for error {error.id} by rule {rule_name}")
    
    async def get_error(self, error_id: str) -> Optional[ErrorData]:
        """Get an error by ID"""
        return self.errors.get(error_id)
    
    def get_errors(self, 
                  component: Optional[str] = None, 
                  source: Optional[ErrorSource] = None,
                  level: Optional[ErrorLevel] = None,
                  resolved: Optional[bool] = None,
                  limit: int = 100) -> List[ErrorData]:
        """Get errors filtered by criteria"""
        filtered = []
        
        for error in self.errors.values():
            # Apply filters
            if component and error.component != component:
                continue
            if source and error.source != source:
                continue
            if level and error.level != level:
                continue
            if resolved is not None and error.resolved != resolved:
                continue
                
            filtered.append(error)
            
            if len(filtered) >= limit:
                break
        
        # Sort by timestamp (newest first)
        filtered.sort(key=lambda e: e.timestamp, reverse=True)
        
        return filtered[:limit]
    
    async def get_component_status(self, component: Optional[str] = None, 
                           source: Optional[str] = None) -> Dict[str, Any]:
        """
        Get status of components
        
        Args:
            component: Filter by component name (optional)
            source: Filter by source (optional)
            
        Returns:
            Dictionary of component statuses
        """
        if component and source:
            key = f"{source}:{component}"
            return {key: self.component_status.get(key, {"status": "unknown"})}
        elif component:
            return {k: v for k, v in self.component_status.items() 
                   if k.endswith(f":{component}")}
        elif source:
            return {k: v for k, v in self.component_status.items() 
                   if k.startswith(f"{source}:")}
        else:
            return self.component_status
    
    def get_alerts(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent alerts"""
        # Sort by timestamp (newest first)
        sorted_alerts = sorted(
            self.alert_history,
            key=lambda a: a['timestamp'],
            reverse=True
        )
        
        return sorted_alerts[:limit]
    
    async def get_analytics(self) -> Dict[str, Any]:
        """Get analytics data about errors"""
        return {
            "summary": self.analyzer.get_summary(),
            "component_status": self.component_status,
            "recovery_stats": {
                "attempts": len(self.recovery_manager.recovery_history),
                "successes": sum(1 for r in self.recovery_manager.recovery_history if r['success']),
                "failures": sum(1 for r in self.recovery_manager.recovery_history if not r['success']),
                "by_strategy": self._count_recovery_by_strategy()
            },
            "alert_stats": {
                "total": len(self.alert_history),
                "by_rule": self._count_alerts_by_rule(),
                "by_component": self._count_alerts_by_component()
            }
        }
    
    def _count_recovery_by_strategy(self) -> Dict[str, Dict[str, int]]:
        """Count recovery attempts by strategy"""
        result = {}
        
        for record in self.recovery_manager.recovery_history:
            strategy = record['strategy']
            if strategy not in result:
                result[strategy] = {
                    "attempts": 0,
                    "successes": 0,
                    "failures": 0
                }
            
            result[strategy]["attempts"] += 1
            if record['success']:
                result[strategy]["successes"] += 1
            else:
                result[strategy]["failures"] += 1
        
        return result
    
    def _count_alerts_by_rule(self) -> Dict[str, int]:
        """Count alerts by rule"""
        counts = defaultdict(int)
        
        for alert in self.alert_history:
            counts[alert['rule']] += 1
        
        return dict(counts)
    
    def _count_alerts_by_component(self) -> Dict[str, int]:
        """Count alerts by component"""
        counts = defaultdict(int)
        
        for alert in self.alert_history:
            component = f"{alert['source']}:{alert['component']}"
            counts[component] += 1
        
        return dict(counts)
    
    async def mark_resolved(self, error_id: str, resolution_info: Dict[str, Any] = None) -> bool:
        """
        Mark an error as resolved
        
        Args:
            error_id: ID of the error to resolve
            resolution_info: Information about how it was resolved
            
        Returns:
            Success status
        """
        if error_id not in self.errors:
            return False
        
        error = self.errors[error_id]
        error.resolved = True
        error.resolution_info = resolution_info or {
            "timestamp": datetime.datetime.now().isoformat(),
            "automatic": False,
            "notes": "Manually resolved"
        }
        
        # Reset recovery attempts for this error
        self.recovery_manager.reset_for_error(error_id)
        
        # Reset component outage alerts
        for rule in self.alert_rules:
            if isinstance(rule, ComponentOutageAlertRule):
                rule.reset_component(error.component, error.source)
        
        # Save errors
        self._save_errors()
        
        return True
    
    async def add_note(self, error_id: str, note: str) -> bool:
        """
        Add a note to an error
        
        Args:
            error_id: ID of the error
            note: Note to add
            
        Returns:
            Success status
        """
        if error_id not in self.errors:
            return False
        
        error = self.errors[error_id]
        error.user_notes = note
        
        # Save errors
        self._save_errors()
        
        return True
    
    async def relate_errors(self, error_ids: List[str]) -> bool:
        """
        Mark errors as related to each other
        
        Args:
            error_ids: List of error IDs that are related
            
        Returns:
            Success status
        """
        if not error_ids or len(error_ids) < 2:
            return False
        
        # Check that all errors exist
        for error_id in error_ids:
            if error_id not in self.errors:
                return False
        
        # Update related_errors for each error
        for error_id in error_ids:
            self.errors[error_id].related_errors = [
                id for id in error_ids if id != error_id
            ]
        
        # Save errors
        self._save_errors()
        
        return True
    
    async def delete_error(self, error_id: str) -> bool:
        """
        Delete an error
        
        Args:
            error_id: ID of the error to delete
            
        Returns:
            Success status
        """
        if error_id not in self.errors:
            return False
        
        # Remove from any related errors
        for other_id, error in self.errors.items():
            if error_id in error.related_errors:
                error.related_errors.remove(error_id)
        
        # Delete the error
        del self.errors[error_id]
        
        # Save errors
        self._save_errors()
        
        return True
    
    async def clear_errors(self, 
                         component: Optional[str] = None,
                         source: Optional[ErrorSource] = None,
                         resolved_only: bool = True) -> int:
        """
        Clear errors
        
        Args:
            component: Clear only errors from this component (optional)
            source: Clear only errors from this source (optional)
            resolved_only: Clear only resolved errors (default True)
            
        Returns:
            Number of errors cleared
        """
        to_delete = []
        
        for error_id, error in self.errors.items():
            # Apply filters
            if component and error.component != component:
                continue
            if source and error.source != source:
                continue
            if resolved_only and not error.resolved:
                continue
                
            to_delete.append(error_id)
        
        # Delete the errors
        for error_id in to_delete:
            await self.delete_error(error_id)
        
        return len(to_delete)
    
    def test(self) -> Dict[str, Any]:
        """Run a self-test of the error monitor"""
        results = {
            "success": True,
            "module": "error_monitor",
            "tests": {}
        }
        
        # Test error creation
        try:
            error = ErrorData(
                id="test-error-1",
                timestamp=datetime.datetime.now().isoformat(),
                level=ErrorLevel.ERROR,
                source=ErrorSource.PYTHON,
                component="error_monitor",
                operation="test",
                message="Test error message"
            )
            results["tests"]["error_creation"] = True
        except Exception as e:
            results["tests"]["error_creation"] = False
            results["tests"]["error_creation_error"] = str(e)
            results["success"] = False
        
        # Test analyzer
        try:
            analyzer = ErrorAnalyzer()
            analyzer.add_error(error)
            summary = analyzer.get_summary()
            results["tests"]["analyzer"] = True
            results["tests"]["analyzer_summary"] = summary is not None
        except Exception as e:
            results["tests"]["analyzer"] = False
            results["tests"]["analyzer_error"] = str(e)
            results["success"] = False
        
        # Test recovery manager (without trying actual recovery)
        try:
            recovery_manager = ErrorRecoveryManager()
            strategies = recovery_manager.strategies
            results["tests"]["recovery_manager"] = True
            results["tests"]["recovery_strategies"] = len(strategies) > 0
        except Exception as e:
            results["tests"]["recovery_manager"] = False
            results["tests"]["recovery_manager_error"] = str(e)
            results["success"] = False
        
        # Test alert rules
        try:
            rule = FatalErrorAlertRule()
            results["tests"]["alert_rule"] = True
            results["tests"]["alert_rule_name"] = rule.name == "fatal_error_alert"
        except Exception as e:
            results["tests"]["alert_rule"] = False
            results["tests"]["alert_rule_error"] = str(e)
            results["success"] = False
        
        return results

# Create default instance
error_monitor = ErrorMonitor()
