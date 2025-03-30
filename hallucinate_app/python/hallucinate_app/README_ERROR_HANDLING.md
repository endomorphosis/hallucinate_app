# Comprehensive Error Handling System

This document describes the comprehensive error handling system implemented for hallucinate_app, focusing on PyArrow Content Index and system-wide error monitoring.

## System Components

### 1. PyArrow Content Index Error Handling

The PyArrow Content Index now includes robust error handling with:

- **Custom Error Classes**: Specialized error types for different scenarios
- **Structured Error Tracking**: All errors are captured with detailed context
- **Error History**: Maintains a history of recent errors with full context
- **Error Categories**: Errors are categorized for better analysis and recovery
- **Bi-directional Error Communication**: Errors propagate between Python and JavaScript

### 2. Advanced Error Monitor

The system includes a sophisticated error monitoring system with:

- **Error Analysis**: Identifies patterns and correlations between errors
- **Automatic Recovery**: Attempts to recover from common error types
- **Alerting System**: Triggers alerts based on configurable rules
- **Component Status Tracking**: Monitors the health of all application components
- **Visualization Dashboard**: Provides real-time error monitoring and analytics

## Key Error Handling Files

1. `/hallucinate_app/python/hallucinate_app/pyarrow_content_index.py`
   - Custom error classes for content index operations
   - Enhanced `_handle_error` method with advanced integration
   - Error categorization and tagging

2. `/hallucinate_app/python/hallucinate_app/error_monitor.py`
   - Central error monitoring system
   - Error analysis and recovery capabilities
   - Component status tracking
   - Alert rules and handling

3. `/hallucinate_app/node/pyarrow_index.js`
   - JavaScript bridge with matching error classes
   - Event-based error notification
   - Error history management

4. `/hallucinate_app/node/dashboard/pyarrow_error_dashboard.js` and `.html`
   - Dashboard UI for error visualization
   - Error filtering and management
   - Real-time error updates

5. `/hallucinate_app/node/dashboard/error_monitor_dashboard.js` and `.html`
   - Advanced dashboard for comprehensive error monitoring
   - Error analytics and component status visualization
   - Recovery tracking and alerting interface

## Using the Error Handling System

### In Python Code

```python
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource
from hallucinate_app.pyarrow_content_index import ContentIndexError

# Option 1: Capture and report an exception
try:
    # Risky operation
    result = process_data()
except Exception as e:
    # Report the exception to the error monitor
    error_id = await error_monitor.add_exception(
        exception=e,
        component="MyComponent",
        operation="process_data",
        level=ErrorLevel.ERROR,
        details={"data_size": data_size, "source": "user_input"}
    )
    # You can use the error_id for reference or to check status later

# Option 2: Create a custom error for specialized handling
try:
    # Risky operation
    validate_input(data)
except ValueError as e:
    # Create a custom content index error
    error = ContentIndexError(str(e), details={"input": data})
    # Handle the error with pyarrow content index handler
    content_index._handle_error("validate_input", error)
```

### In JavaScript Code

```javascript
import { createErrorReporter } from '../node/dashboard';

// Create an error reporter
const reportError = createErrorReporter(mainWindow);

try {
  // Risky operation
  const result = processData();
} catch (error) {
  // Report the error with context
  reportError(error, 'processData', {
    component: 'DataProcessor',
    level: 'error',
    tags: ['data-processing', 'user-input'],
    details: {
      dataSize: dataSize,
      source: 'user-input'
    }
  });
}
```

## Error Recovery Strategies

The system includes automated recovery strategies for common error types:

1. **Content Index Recovery**:
   - Table corruption: Restores from backup or rebuilds table
   - Index out of sync: Rebuilds indexes
   - Memory errors: Clears memory and reloads with memory mapping

2. **Database Recovery**:
   - Connection errors: Attempts to reconnect
   - Timeout errors: Increases timeout and retries
   - Lock errors: Waits for lock release and retries

3. **IPFS Recovery**:
   - Connection errors: Reconnects to IPFS node
   - Timeout errors: Increases timeout and retries
   - Unreachable errors: Attempts to find alternative routes

## Error Dashboard Usage

### PyArrow Error Dashboard

1. View all errors from PyArrow Content Index
2. Filter by level, source, operation, etc.
3. Export error logs for analysis
4. Clear error history

### Advanced Error Monitor Dashboard

1. View all errors across the system with detailed analytics
2. Monitor component status in real-time
3. View and manage alerts
4. Track recovery attempts and successes
5. Analyze error patterns and trends
6. Apply manual recovery strategies

## Error Classification

Errors are classified by:

1. **Level**:
   - DEBUG: Informational for debugging
   - INFO: Informational events
   - WARNING: Potential issues that don't impact functionality
   - ERROR: Issues that impact functionality
   - FATAL: Critical issues that prevent operation

2. **Source**:
   - PYTHON: Python code
   - JAVASCRIPT: JavaScript code
   - IPFS: IPFS-related operations
   - DATABASE: Database operations
   - CONTENT_INDEX: Content index operations
   - MODEL: ML model operations
   - DATASET: Dataset operations

3. **Component**: Specific component (e.g., "PyArrowContentIndex")

4. **Category**: Specific error category (e.g., "not_found", "validation", "storage")

## Alert Rules

The system includes configurable alert rules:

1. **Fatal Error Alert**: Triggers on any fatal error
2. **Frequency Alert**: Triggers when errors occur frequently
3. **Component Outage Alert**: Triggers when a component appears to be experiencing an outage

## Integration with Electron

The error handling system seamlessly integrates with the Electron application:

1. Errors from Python are propagated to JavaScript via the bridge
2. Errors are displayed in real-time in the dashboards
3. Users can interact with errors, add notes, and apply recovery strategies

## Best Practices

1. **Always use structured error handling**:
   - Wrap risky operations in try/catch blocks
   - Use the `_handle_error` method or `error_monitor.add_exception`
   - Provide detailed context with all errors

2. **Categorize errors appropriately**:
   - Use the right error level (ERROR, WARNING, FATAL, etc.)
   - Tag errors for better filtering and analysis
   - Include all relevant details for debugging

3. **Monitor the dashboard regularly**:
   - Check for patterns in errors
   - Address recurring issues
   - Monitor component status

4. **Implement recovery strategies**:
   - Add recovery strategies for common error types
   - Test recovery strategies in controlled environments
   - Document recovery procedures

5. **Keep error logs clean**:
   - Resolve or delete old errors
   - Export and archive error logs for long-term analysis
   - Clear resolved errors periodically