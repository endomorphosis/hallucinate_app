# Auto Error Reporting System

Automatically creates GitHub issues from runtime errors in both Python and JavaScript components.

## Quick Start

1. **Install dependencies**:
   ```bash
   # Python
   pip install PyGithub
   
   # JavaScript
   npm install @octokit/rest
   ```

2. **Set environment variables**:
   ```bash
   export GITHUB_ISSUE_REPORTER_ENABLED=true
   export GITHUB_TOKEN=your_github_token_here
   export GITHUB_REPOSITORY=owner/repo
   ```

3. **Get a GitHub token**:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (for private repos) or `public_repo` (for public repos)
   - Copy the token and use it as `GITHUB_TOKEN`

4. **Test in dry run mode** (recommended):
   ```bash
   export GITHUB_ISSUE_DRY_RUN=true
   ```

## Components

### Python
- `github_issue_reporter.py` - Main reporter module
- Integrates with `error_monitor.py` 
- Automatically reports errors from ErrorMonitor

### JavaScript
- `github_issue_reporter.js` - Main reporter module
- Integrates with `mcp_daemon_manager.js`
- Automatically reports MCP daemon errors

## Features

✅ **Automatic Issue Creation** - Errors create GitHub issues automatically  
✅ **Duplicate Detection** - Prevents duplicate issues for the same error  
✅ **Rate Limiting** - Configurable limits to prevent API abuse  
✅ **Severity Filtering** - Only report errors above a threshold  
✅ **Rich Context** - Stack traces, system info, and error details  
✅ **Dry Run Mode** - Test without creating actual issues  

## Configuration

See [ERROR_REPORTING.md](../docs/ERROR_REPORTING.md) for full configuration details.

## Security

⚠️ **NEVER commit your GitHub token to the repository!**

- Store tokens in environment variables
- Use `.env` files (added to `.gitignore`)
- Use secrets management in production
- Use GitHub Actions secrets for CI/CD

## Testing

Run tests to verify the system works:

```bash
# Python tests
python -m pytest hallucinate_app/python/hallucinate_app/test/test_github_issue_reporter.py

# JavaScript tests  
npm test -- test/js/test_github_issue_reporter.js
```

## Example Usage

### Python

```python
from hallucinate_app.error_monitor import error_monitor

# Errors are automatically reported when they occur
try:
    raise ValueError("Something went wrong")
except Exception as e:
    await error_monitor.add_exception(
        e,
        component='MyComponent',
        operation='my_operation'
    )
```

### JavaScript

```javascript
import { reportException } from './hallucinate_app/node/github_issue_reporter.js';

try {
    throw new Error('Something went wrong');
} catch (error) {
    await reportException(error, {
        component: 'MyComponent',
        operation: 'my_operation'
    });
}
```

## Files

- `hallucinate_app/python/hallucinate_app/github_issue_reporter.py` - Python reporter
- `hallucinate_app/node/github_issue_reporter.js` - JavaScript reporter
- `hallucinate_app/python/hallucinate_app/test/test_github_issue_reporter.py` - Python tests
- `test/js/test_github_issue_reporter.js` - JavaScript tests
- `docs/ERROR_REPORTING.md` - Full documentation
- `.env.example` - Example environment configuration

## Troubleshooting

**Issues not being created?**
- Check `GITHUB_ISSUE_REPORTER_ENABLED=true`
- Verify GitHub token is valid
- Check error level meets minimum threshold
- Verify not hitting rate limit

**Too many issues?**
- Increase `GITHUB_ISSUE_MIN_LEVEL`
- Reduce `GITHUB_ISSUE_RATE_LIMIT`
- Increase `GITHUB_ISSUE_DUPLICATE_WINDOW`

See [ERROR_REPORTING.md](../docs/ERROR_REPORTING.md) for more troubleshooting.
