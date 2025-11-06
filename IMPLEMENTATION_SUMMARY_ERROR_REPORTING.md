# Auto Error Reporting Implementation Summary

## Overview

This implementation adds automatic GitHub issue creation from runtime errors in both JavaScript and Python components of the hallucinate_app project.

## Problem Solved

The issue requested:
> "can you somehow create the means that errors that are passed to the program while the program is running at runtime, e.g. the mcp server dashboard javascript, or the python interpreter in the docker container, are all auto generating error reports that are being converted into github issues."

## Solution

We've implemented a comprehensive auto error reporting system that:

1. **Captures runtime errors** from both JavaScript and Python code
2. **Automatically creates GitHub issues** with detailed error information
3. **Prevents duplicate issues** using error fingerprinting
4. **Controls reporting rate** to avoid API abuse
5. **Filters errors by severity** to only report important issues
6. **Works in both environments**: Node.js/Electron and Python/Docker

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Application Runtime                        │
│                                                             │
│  ┌──────────────┐           ┌──────────────┐              │
│  │  JavaScript  │           │    Python    │              │
│  │   Runtime    │           │   Runtime    │              │
│  └──────┬───────┘           └──────┬───────┘              │
│         │                          │                        │
│         │ Errors                   │ Errors                 │
│         ▼                          ▼                        │
│  ┌──────────────┐           ┌──────────────┐              │
│  │     MCP      │           │    Error     │              │
│  │    Daemon    │           │   Monitor    │              │
│  │   Manager    │           │              │              │
│  └──────┬───────┘           └──────┬───────┘              │
│         │                          │                        │
│         │                          │                        │
│         ▼                          ▼                        │
│  ┌─────────────────────────────────────────┐              │
│  │     GitHub Issue Reporter (JS/Python)   │              │
│  │                                          │              │
│  │  - Fingerprinting                        │              │
│  │  - Duplicate Detection                   │              │
│  │  - Rate Limiting                         │              │
│  │  - Issue Formatting                      │              │
│  └──────────────┬───────────────────────────┘              │
│                 │                                           │
└─────────────────┼───────────────────────────────────────────┘
                  │
                  │ Creates Issues
                  ▼
          ┌──────────────┐
          │   GitHub     │
          │   Issues     │
          └──────────────┘
```

### Key Features

1. **Error Fingerprinting**
   - Each error gets a unique fingerprint (SHA256 hash)
   - Based on: error level + source + component + message
   - Used for duplicate detection

2. **Duplicate Detection**
   - Tracks recently reported errors
   - Configurable time window (default: 24 hours)
   - Prevents spam from repeated errors

3. **Rate Limiting**
   - Per-hour limit on issue creation (default: 10/hour)
   - Prevents API abuse
   - Configurable threshold

4. **Severity Filtering**
   - Only reports errors above minimum level
   - Default: ERROR and FATAL only
   - Configurable per deployment

5. **Rich Issue Content**
   - Error message and stack trace
   - System information (platform, version, etc.)
   - Operation context
   - Tags for categorization
   - Occurrence count for duplicates

## Implementation Details

### Python Components

**File**: `hallucinate_app/python/hallucinate_app/github_issue_reporter.py`

- `GitHubIssueReporter` class: Main reporter
- `IssueReportConfig` class: Configuration management
- Uses `PyGithub` library for GitHub API
- Integrates with existing `ErrorMonitor`

**Integration**: `hallucinate_app/python/hallucinate_app/error_monitor.py`

- Modified `_process_error` method to report to GitHub
- Lazy import to avoid circular dependencies
- Configuration via `enable_github_reporting` flag

### JavaScript Components

**File**: `hallucinate_app/node/github_issue_reporter.js`

- `GitHubIssueReporter` class: Main reporter
- `IssueReportConfig` class: Configuration management
- Uses `@octokit/rest` library for GitHub API
- Standalone usage or integration with MCP daemon manager

**Integration**: `hallucinate_app/node/mcp_daemon_manager.js`

- Added error reporting to daemon error handlers
- Reports both startup errors and crash events
- Includes daemon context (port, restart count, logs)

## Configuration

### Environment Variables

```bash
# Enable/disable reporting
GITHUB_ISSUE_REPORTER_ENABLED=true

# GitHub credentials
GITHUB_TOKEN=ghp_xxxxx
GITHUB_REPOSITORY=owner/repo

# Behavior
GITHUB_ISSUE_MIN_LEVEL=error
GITHUB_ISSUE_RATE_LIMIT=10
GITHUB_ISSUE_DUPLICATE_WINDOW=24

# Issue metadata
GITHUB_ISSUE_LABELS=auto-reported,bug
GITHUB_ISSUE_ASSIGNEES=username1,username2

# Testing
GITHUB_ISSUE_DRY_RUN=true  # Don't create actual issues
```

### Configuration File

Alternative: Use `.env` file (added to `.gitignore`)

```bash
cp .env.example .env
# Edit .env with your values
```

## Security

### GitHub Token Management

✅ **Implemented**:
- Token stored in environment variables
- `.env` files added to `.gitignore`
- Documentation warns against committing tokens
- Example configuration provided

⚠️ **Important**:
- Never commit GitHub tokens to repository
- Use secrets management in production
- Token requires `repo` or `public_repo` scope

### Rate Limiting

✅ **Implemented**:
- Per-hour limits prevent API abuse
- Configurable threshold
- Tracks timestamps of recent issues
- Automatic cleanup of old entries

## Testing

### Test Files

1. **Python**: `hallucinate_app/python/hallucinate_app/test/test_github_issue_reporter.py`
   - Tests configuration
   - Tests fingerprinting
   - Tests duplicate detection
   - Tests rate limiting
   - Tests issue formatting

2. **JavaScript**: `test/js/test_github_issue_reporter.js`
   - Tests configuration
   - Tests fingerprinting
   - Tests duplicate detection
   - Tests rate limiting
   - Tests issue formatting

### Example Files

1. **Python**: `hallucinate_app/python/hallucinate_app/examples/error_reporting_example.py`
   - Demonstrates direct reporter usage
   - Demonstrates ErrorMonitor integration
   - Runs in dry-run mode by default

2. **JavaScript**: `hallucinate_app/node/examples/error_reporting_example.js`
   - Demonstrates direct reporter usage
   - Demonstrates exception reporting
   - Demonstrates duplicate detection
   - Runs in dry-run mode by default

### Running Tests

```bash
# Python tests
python -m pytest hallucinate_app/python/hallucinate_app/test/test_github_issue_reporter.py

# JavaScript tests
npm test -- test/js/test_github_issue_reporter.js

# Python example
cd hallucinate_app/python
PYTHONPATH=/path/to/hallucinate_app/python python3 hallucinate_app/examples/error_reporting_example.py

# JavaScript example
node hallucinate_app/node/examples/error_reporting_example.js
```

## Documentation

### Created Documentation

1. **`docs/ERROR_REPORTING.md`** - Comprehensive guide
   - Overview and features
   - Configuration details
   - Security considerations
   - Testing instructions
   - Troubleshooting guide
   - Best practices

2. **`ERROR_REPORTING_README.md`** - Quick start guide
   - Installation steps
   - Quick configuration
   - Basic usage examples
   - File listing

3. **`.env.example`** - Example configuration
   - All available settings
   - Sensible defaults
   - Comments explaining each option

## Dependencies

### Added

**Python**: `requirements.txt`
```
PyGithub>=2.1.1
```

**JavaScript**: `package.json`
```
@octokit/rest: ^20.0.2
```

## Usage Examples

### Python - Automatic via ErrorMonitor

```python
from hallucinate_app.error_monitor import error_monitor

# Configure with GitHub reporting enabled
config = {
    'enable_github_reporting': True
}
monitor = ErrorMonitor(config=config)

# Errors are automatically reported
try:
    raise ValueError("Something went wrong")
except Exception as e:
    await monitor.add_exception(
        e,
        component='MyComponent',
        operation='my_operation'
    )
    # GitHub issue created automatically!
```

### Python - Direct Usage

```python
from hallucinate_app.github_issue_reporter import reportError
from hallucinate_app.error_monitor import ErrorData, ErrorLevel, ErrorSource

error = ErrorData(
    id='unique-id',
    timestamp='2024-01-15T10:30:00Z',
    level=ErrorLevel.ERROR,
    source=ErrorSource.PYTHON,
    component='MyComponent',
    operation='my_operation',
    message='Error message',
    stack_trace='...'
)

issue_url = reportError(error)
print(f"Issue created: {issue_url}")
```

### JavaScript - Automatic via MCP Daemon

```javascript
// MCP daemon errors are automatically reported when
// GITHUB_ISSUE_REPORTER_ENABLED=true

// No additional code needed - errors from daemon 
// crashes are automatically reported to GitHub
```

### JavaScript - Direct Usage

```javascript
import { reportException } from './hallucinate_app/node/github_issue_reporter.js';

try {
    throw new Error('Something went wrong');
} catch (error) {
    const issueUrl = await reportException(error, {
        component: 'MyComponent',
        operation: 'my_operation'
    });
    console.log(`Issue created: ${issueUrl}`);
}
```

## Example GitHub Issue

When an error is reported, a GitHub issue is created like this:

**Title**: `[ERROR] ValueError in PyArrowContentIndex`

**Body**:
```markdown
## Auto-Generated Error Report

**Error ID:** `abc123-def456-ghi789`
**Timestamp:** 2024-01-15T10:30:00.000Z
**Level:** `error`
**Source:** `python`
**Component:** `PyArrowContentIndex`
**Operation:** `add_entry`

### Error Message
```
ValueError: Invalid CID format
```

### Stack Trace
```
Traceback (most recent call last):
  File "pyarrow_index.py", line 123, in add_entry
    validate_cid(cid)
ValueError: Invalid CID format
```

### System Information
- **python_version:** `3.11.0`
- **platform:** `linux`

### Tags
`pyarrow`, `python`, `error`

---
*This issue was automatically generated by the error monitoring system.*
```

**Labels**: `auto-reported`, `bug`

## Deployment

### Development

1. Copy `.env.example` to `.env`
2. Add your GitHub token
3. Set `GITHUB_ISSUE_DRY_RUN=true` for testing
4. Run the application

### Production

1. Set environment variables in deployment configuration
2. Use secrets management for `GITHUB_TOKEN`
3. Set `GITHUB_ISSUE_DRY_RUN=false`
4. Monitor created issues regularly

### Docker

The system works in Docker containers when environment variables are properly passed:

```dockerfile
ENV GITHUB_ISSUE_REPORTER_ENABLED=true
ENV GITHUB_TOKEN=${GITHUB_TOKEN}
ENV GITHUB_REPOSITORY=owner/repo
```

Or at runtime:

```bash
docker run -e GITHUB_TOKEN=$GITHUB_TOKEN \
           -e GITHUB_ISSUE_REPORTER_ENABLED=true \
           -e GITHUB_REPOSITORY=owner/repo \
           hallucinate_app
```

## Future Enhancements

Potential improvements for future iterations:

1. **Issue Grouping**: Group related errors into single issue
2. **Auto-Close**: Automatically close issues when errors stop occurring
3. **Severity Escalation**: Escalate issues if error frequency increases
4. **Integration with Other Services**: 
   - Slack notifications
   - Email alerts
   - PagerDuty integration
5. **Enhanced Analytics**:
   - Error trend analysis
   - Component health scoring
   - Automatic root cause suggestions
6. **Multi-Repository Support**: Report to different repos based on component
7. **Custom Issue Templates**: Configurable issue templates per error type

## Troubleshooting

### Issues Not Being Created

1. Check `GITHUB_ISSUE_REPORTER_ENABLED=true`
2. Verify GitHub token is valid
3. Check error level meets minimum threshold
4. Verify not hitting rate limit
5. Check logs for error messages

### Too Many Issues

1. Increase `GITHUB_ISSUE_MIN_LEVEL` 
2. Reduce `GITHUB_ISSUE_RATE_LIMIT`
3. Increase `GITHUB_ISSUE_DUPLICATE_WINDOW`

### PyGithub Not Available

```bash
pip install PyGithub
```

### @octokit/rest Not Available

```bash
npm install @octokit/rest
```

## Summary

This implementation successfully addresses the requirement to automatically generate GitHub issues from runtime errors in both JavaScript and Python components. The system is:

✅ **Complete** - Handles errors from all runtime environments  
✅ **Configurable** - Extensive configuration options  
✅ **Secure** - Proper token management and security practices  
✅ **Tested** - Comprehensive test suite  
✅ **Documented** - Extensive documentation and examples  
✅ **Production-Ready** - Dry-run mode, rate limiting, duplicate detection  

The implementation is minimal, focused, and integrates cleanly with the existing codebase without disrupting current functionality.
