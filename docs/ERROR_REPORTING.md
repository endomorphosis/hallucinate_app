# Auto Error Reporting Configuration

This document describes how to configure the automatic GitHub issue reporting system.

## Overview

The hallucinate_app includes an automatic error reporting system that can create GitHub issues when runtime errors occur in either Python or JavaScript components. This helps track and respond to issues quickly.

## Features

- **Automatic Issue Creation**: Errors are automatically reported to GitHub Issues
- **Duplicate Detection**: Similar errors are grouped together to avoid spam
- **Rate Limiting**: Configurable rate limits prevent API abuse
- **Severity Filtering**: Only report errors above a certain severity level
- **Rich Issue Details**: Issues include stack traces, system info, and error context
- **Dry Run Mode**: Test the system without creating actual issues

## Configuration

### Environment Variables

The error reporting system is configured via environment variables:

#### Required Variables

```bash
# Enable the GitHub issue reporter
export GITHUB_ISSUE_REPORTER_ENABLED=true

# GitHub personal access token with repo permissions
export GITHUB_TOKEN=ghp_YourTokenHere

# Repository in format owner/repo
export GITHUB_REPOSITORY=endomorphosis/hallucinate_app
```

#### Optional Variables

```bash
# Minimum error level to report (debug, info, warning, error, fatal)
# Default: error
export GITHUB_ISSUE_MIN_LEVEL=error

# Maximum number of issues to create per hour
# Default: 10
export GITHUB_ISSUE_RATE_LIMIT=10

# Time window in hours to check for duplicate errors
# Default: 24
export GITHUB_ISSUE_DUPLICATE_WINDOW=24

# Comma-separated list of labels to add to created issues
# Default: auto-reported,bug
export GITHUB_ISSUE_LABELS=auto-reported,bug,needs-triage

# Comma-separated list of GitHub usernames to assign issues to
# Default: (none)
export GITHUB_ISSUE_ASSIGNEES=username1,username2

# Auto-assign issues to specified users
# Default: false
export GITHUB_ISSUE_AUTO_ASSIGN=true

# Include stack traces in issue reports
# Default: true
export GITHUB_ISSUE_INCLUDE_STACK=true

# Include system information in issue reports
# Default: true
export GITHUB_ISSUE_INCLUDE_SYSTEM_INFO=true

# Dry run mode - log instead of creating issues
# Default: false
export GITHUB_ISSUE_DRY_RUN=false
```

## Usage

### Python

The Python error reporting integrates automatically with the ErrorMonitor system:

```python
from hallucinate_app.error_monitor import error_monitor, ErrorLevel, ErrorSource

# Configure error monitor with GitHub reporting enabled
config = {
    'enable_github_reporting': True,
    'github_config': {
        'enabled': True,
        'min_error_level': ErrorLevel.ERROR
    }
}

# The error monitor will automatically report errors
monitor = ErrorMonitor(config=config)

# Errors will be reported to GitHub
try:
    # Your code here
    raise ValueError("Something went wrong")
except Exception as e:
    await monitor.add_exception(
        e,
        component='MyComponent',
        operation='my_operation',
        level=ErrorLevel.ERROR
    )
```

### JavaScript

The JavaScript error reporting integrates with the MCP daemon manager and can also be used standalone:

```javascript
import { getReporter, reportException } from './hallucinate_app/node/github_issue_reporter.js';

// The MCP daemon manager automatically reports errors when enabled
// via GITHUB_ISSUE_REPORTER_ENABLED=true

// Or use the reporter directly
try {
  // Your code here
  throw new Error('Something went wrong');
} catch (error) {
  await reportException(error, {
    component: 'MyComponent',
    operation: 'my_operation',
    level: ErrorLevel.ERROR
  });
}
```

## Security Considerations

### GitHub Token

The GitHub token should have the following permissions:
- `repo` (for private repositories) or `public_repo` (for public repositories only)

**IMPORTANT**: Never commit your GitHub token to the repository!

Store it securely:
- Use environment variables
- Use a secrets management system (e.g., AWS Secrets Manager, HashiCorp Vault)
- Use GitHub Actions secrets for CI/CD

### Adding to .gitignore

If you create a `.env` file for local development, make sure it's in `.gitignore`:

```bash
# .env file example
GITHUB_TOKEN=ghp_YourTokenHere
GITHUB_REPOSITORY=owner/repo
GITHUB_ISSUE_REPORTER_ENABLED=true
```

## Testing

### Dry Run Mode

Test the error reporting system without creating actual issues:

```bash
export GITHUB_ISSUE_DRY_RUN=true
```

In dry run mode:
- Error fingerprints are still calculated
- Rate limiting is still enforced
- Duplicate detection still works
- Issue formatting is tested
- No actual GitHub API calls are made
- Logs show what would have been created

### Running Tests

#### Python Tests

```bash
python -m pytest hallucinate_app/python/hallucinate_app/test/test_github_issue_reporter.py
```

#### JavaScript Tests

```bash
npm test -- test/js/test_github_issue_reporter.js
```

## Troubleshooting

### Issues Not Being Created

1. Check that `GITHUB_ISSUE_REPORTER_ENABLED=true`
2. Verify your GitHub token is valid and has the right permissions
3. Check the error level meets the minimum threshold
4. Verify you're not hitting the rate limit
5. Check if the error is being detected as a duplicate

### Too Many Issues Being Created

1. Increase `GITHUB_ISSUE_MIN_LEVEL` to only report more severe errors
2. Reduce `GITHUB_ISSUE_RATE_LIMIT`
3. Increase `GITHUB_ISSUE_DUPLICATE_WINDOW` to catch more duplicates

### Token Authentication Errors

1. Verify token has `repo` or `public_repo` scope
2. Check token hasn't expired
3. Verify repository format is correct: `owner/repo`
4. Ensure you have write access to the repository

## Examples

### Example Issue

When an error is reported, a GitHub issue is created with this format:

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

## Best Practices

1. **Use Appropriate Error Levels**: Only report errors that need attention
2. **Add Context**: Include relevant details when adding errors to the monitor
3. **Monitor Rate Limits**: Adjust rate limits based on your usage patterns
4. **Review Issues Regularly**: Auto-reported issues still need human review
5. **Close Resolved Issues**: Mark issues as resolved when fixed
6. **Use Labels**: Add labels to categorize and prioritize issues
7. **Test in Dry Run**: Test changes in dry run mode first

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Run with Error Reporting

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Run with error reporting
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          GITHUB_ISSUE_REPORTER_ENABLED: true
          GITHUB_ISSUE_MIN_LEVEL: error
          GITHUB_ISSUE_LABELS: ci-error,automated
        run: |
          npm start
```

## Disabling Error Reporting

To disable error reporting:

```bash
export GITHUB_ISSUE_REPORTER_ENABLED=false
```

Or simply don't set the `GITHUB_TOKEN` environment variable.
