# Error Monitoring System

The Error Monitoring System provides real-time monitoring, analysis, and visualization of errors across the hallucinate_app application. It helps developers identify, track, and resolve issues efficiently.

## Components

### Core Error Monitor

The `ErrorMonitor` class (`error_monitor.py`) is the central component that:

- Tracks errors across different sources (Python, JavaScript, IPFS, databases, etc.)
- Analyzes error patterns and trends
- Provides automated recovery strategies
- Generates alerts based on configurable rules
- Tracks component health status

### Dashboard Integration

The Error Monitoring Dashboard provides a comprehensive visualization interface:

- **ErrorMonitorStatusPanel**: UI component for visualizing error data
- **ErrorMonitorDashboard**: Comprehensive dashboard that embeds the panel

## Usage Examples

### Basic Error Reporting

```python
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource

try:
    # Your code here
    result = potentially_failing_function()
except Exception as e:
    # Report the exception to the error monitor
    error_id = await error_monitor.add_exception(
        exception=e,
        component="my_component",
        operation="my_operation",
        source=ErrorSource.PYTHON,
        level=ErrorLevel.ERROR,
        details={"context": "Additional information"}
    )
    
    print(f"Error reported with ID: {error_id}")
```

### Initializing the Dashboard

```python
from hallucinate_app.error_monitor import error_monitor
from hallucinate_app.dashboard.error_monitor_dashboard import ErrorMonitorDashboard

# Create resources dictionary
resources = {
    "error_monitor": error_monitor,
    "threadPool": thread_pool  # Optional
}

# Configure dashboard
dashboard_config = {
    "dashboardDir": "/path/to/dashboard/data",
    "refreshInterval": 5000,  # 5 seconds
    "theme": "dark",
    "enableServer": True,
    "serverPort": 8081
}

# Initialize dashboard
dashboard = ErrorMonitorDashboard(
    resources=resources,
    metadata=dashboard_config
)

# Start the dashboard
await dashboard.init()

# Get dashboard HTML
html = dashboard.get_dashboard_html()

# To stop the dashboard when done
await dashboard.close()
```

### Custom Error Recovery Strategies

You can create custom recovery strategies for specific error types:

```python
from hallucinate_app.error_monitor import ErrorRecoveryStrategy, ErrorData

class MyCustomRecoveryStrategy(ErrorRecoveryStrategy):
    """Custom recovery strategy for my component"""
    
    def __init__(self, resources=None):
        super().__init__("my_custom_recovery")
        self.resources = resources or {}
    
    async def can_recover(self, error: ErrorData) -> bool:
        """Check if this strategy can recover from the error"""
        if error.component != "my_component":
            return False
        
        # Check for specific error conditions
        if "specific error condition" in error.message.lower():
            return True
        
        return False
    
    async def recover(self, error: ErrorData) -> Tuple[bool, Dict[str, Any]]:
        """Attempt to recover from the error"""
        try:
            # Implement recovery logic
            # ...
            
            return True, {
                "strategy": self.name,
                "actions_taken": ["specific recovery action"],
                "error_id": error.id
            }
        except Exception as e:
            return False, {
                "strategy": self.name,
                "error": str(e),
                "error_id": error.id
            }

# Add the custom strategy to the monitor
error_monitor.recovery_manager.add_strategy(MyCustomRecoveryStrategy(resources))
```

### Custom Alert Rules

You can create custom alert rules:

```python
from hallucinate_app.error_monitor import AlertRule, ErrorData, ErrorAnalyzer

class MyCustomAlertRule(AlertRule):
    """Custom alert rule for specific conditions"""
    
    def __init__(self):
        super().__init__("my_custom_alert")
    
    def should_alert(self, error: ErrorData, analyzer: ErrorAnalyzer) -> bool:
        """Check if an alert should be triggered for this error"""
        # Alert on specific conditions
        if error.component == "critical_component" and "important error" in error.message.lower():
            return True
        
        return False

# Add the custom alert rule to the monitor
error_monitor.add_alert_rule(MyCustomAlertRule())
```

### Adding Alert Handlers

You can register handlers to be notified when alerts are triggered:

```python
def my_alert_handler(error, alert_reason):
    """Handle alerts from the error monitor"""
    print(f"ALERT: {alert_reason} - {error.level} in {error.component}: {error.message}")
    
    # Send notification via Slack, email, etc.
    # ...

# Register the handler
error_monitor.add_alert_handler(my_alert_handler)
```

## Error Classification

Errors are classified along several dimensions:

### Error Levels

- **FATAL**: Application-breaking errors requiring immediate attention
- **ERROR**: Serious errors that affect functionality but don't break the application
- **WARNING**: Issues that might lead to problems but don't immediately affect functionality
- **INFO**: Informational messages about minor issues
- **DEBUG**: Low-level diagnostic information

### Error Sources

- **PYTHON**: Errors in Python code
- **JAVASCRIPT**: Errors in JavaScript code (via JS bridge)
- **ELECTRON**: Errors in Electron app shell
- **IPFS**: Errors in IPFS interactions
- **DATABASE**: Errors in database operations
- **CONTENT_INDEX**: Errors in PyArrow Content Index
- **MODEL**: Errors in ML model operations
- **DATASET**: Errors in dataset handling

## Dashboard Integration

The Error Monitoring System includes a comprehensive dashboard for visualizing error data:

### Dashboard Architecture

The Error Monitoring Dashboard consists of two main components:

1. **ErrorMonitorStatusPanel**: A UI component that renders various error monitoring views
2. **ErrorMonitorDashboard**: A container that integrates the panel with server capabilities

```python
from hallucinate_app.error_monitor import error_monitor
from hallucinate_app.dashboard.error_monitor_dashboard import ErrorMonitorDashboard

# Initialize dashboard with resources
dashboard = ErrorMonitorDashboard(
    resources={"error_monitor": error_monitor, "threadPool": thread_pool},
    metadata={
        "dashboardDir": "/path/to/dashboard/data",
        "refreshInterval": 5000,  # 5 seconds
        "theme": "dark",
        "enableServer": True,
        "serverPort": 8081
    }
)

# Initialize and start the dashboard
await dashboard.init()

# Generate dashboard HTML
html_content = dashboard.get_dashboard_html()

# Get current dashboard state
state = dashboard.get_dashboard_state()
```

### Dashboard Features

The Error Monitoring Dashboard provides:

#### Overview Tab
- Health status of all components with color-coded indicators
- Recent alerts with severity and timestamp information
- Error summary metrics including total errors and error rates
- Interactive refresh controls and real-time updates

#### Errors Tab
- Detailed error list with comprehensive filtering options:
  - By error level (fatal, error, warning, info, debug)
  - By source (Python, JavaScript, IPFS, database, etc.)
  - By component name
  - By resolution status (resolved, unresolved)
  - By time range (hour, day, week, month, all)
- Stack traces with toggle visibility
- Resolution status and history information
- Notes and manual resolution controls
- Color-coded error indicators by severity

#### Analytics Tab
- Error distribution visualizations by source, component, and time
- Top errors by frequency with occurrence counts
- Recovery strategy statistics and success rates
- Data export capabilities (JSON and CSV formats)
- Trend analysis with hourly, daily, and weekly error rates

#### Component Status Tab
- Health status of all components with color indicators
- Error counts and last updated timestamps
- Filtering by status (healthy, warning, degraded, critical)
- Filtering by source type
- Detailed component information

### Real-time Updates

The dashboard supports real-time updates through:

1. **Event-based updates**: The dashboard subscribes to error monitoring events
2. **Automatic refresh**: Configurable refresh interval
3. **Manual refresh**: User-triggered refresh controls

## Integration with Other Systems

### Module Integration

The Error Monitoring System integrates with various modules:

- **Database Sync Manager**: Monitors database sync operations with error reporting and recovery
- **PyArrow Content Index**: Tracks content index operations with specialized recovery strategies
- **IPFS Kit**: Monitors IPFS operations with network-specific error handling
- **Model Manager**: Tracks ML model errors with specialized recovery options

### Dashboard System Integration

The Error Monitoring Dashboard integrates with other dashboard components:

```python
# Integrated dashboard initialization
from hallucinate_app.dashboard import (
    ErrorMonitorDashboard,
    DatabaseSyncDashboard
)

# Initialize individual dashboards
error_dashboard = ErrorMonitorDashboard(
    resources={"error_monitor": error_monitor},
    metadata={"serverPort": 8081, "theme": "dark"}
)
await error_dashboard.init()

db_sync_dashboard = DatabaseSyncDashboard(
    resources={"syncManager": sync_manager},
    metadata={"serverPort": 8080, "theme": "dark"}
)
await db_sync_dashboard.init()

# Create a unified dashboard HTML with both components
def get_unified_dashboard():
    """Generate a unified dashboard HTML with all monitoring components"""
    html = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "  <title>Hallucinate App Monitoring</title>",
        "  <style>",
        "    .dashboard-container { display: flex; flex-direction: column; gap: 20px; }",
        "    .dashboard-section { border: 1px solid #ccc; padding: 15px; border-radius: 5px; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <h1>Unified Monitoring Dashboard</h1>",
        "  <div class='dashboard-container'>",
        "    <div class='dashboard-section'>",
        f"      <h2>Error Monitoring</h2>{error_dashboard.panel.get_panel_html()}",
        "    </div>",
        "    <div class='dashboard-section'>",
        f"      <h2>Database Sync Monitoring</h2>{db_sync_dashboard.panel.get_panel_html()}",
        "    </div>",
        "  </div>",
        "</body>",
        "</html>"
    ]
    return "\n".join(html)
```

This unified approach makes it possible to have a comprehensive monitoring solution that provides visibility across various aspects of the system.

## Technical Details

### Error Data Structure

Each error includes:
- Unique identifier
- Timestamp
- Level and source
- Component and operation
- Message and details
- Stack trace (if available)
- Resolution status and history
- Related errors
- User notes
- Recovery strategies

### Recovery Process

When an error occurs:
1. Error is added to the monitor
2. Analyzer processes it to identify patterns
3. Recovery manager attempts automatic recovery if possible
4. Alert rules are checked and alerts generated if needed
5. Component status is updated
6. Dashboard is refreshed

### Thread Safety

The Error Monitor uses async queues for error processing, making it safe to use from multiple threads or coroutines. All dashboard operations are also async-safe.