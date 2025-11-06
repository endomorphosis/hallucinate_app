#!/usr/bin/env python3
"""
Example: Auto Error Reporting

Demonstrates how the auto error reporting system works.
Run this with GITHUB_ISSUE_DRY_RUN=true to test without creating issues.
"""

import os
import sys
import asyncio

# Set up the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from hallucinate_app.github_issue_reporter import (
    GitHubIssueReporter,
    IssueReportConfig,
    report_error
)
from hallucinate_app.error_monitor import (
    ErrorMonitor,
    ErrorData,
    ErrorLevel,
    ErrorSource
)


async def main():
    """Run examples"""
    
    print("=" * 60)
    print("Auto Error Reporting Example")
    print("=" * 60)
    print()
    
    # Example 1: Direct use of the GitHub reporter
    print("Example 1: Direct GitHub reporter usage")
    print("-" * 60)
    
    # Configure for dry run mode
    config = IssueReportConfig(
        enabled=True,
        github_token=os.getenv('GITHUB_TOKEN', 'test_token'),
        repository=os.getenv('GITHUB_REPOSITORY', 'owner/repo'),
        min_error_level=ErrorLevel.ERROR,
        dry_run=True  # Safe for testing
    )
    
    reporter = GitHubIssueReporter(config)
    
    # Create a sample error
    error = ErrorData(
        id='example-001',
        timestamp='2024-01-15T10:30:00.000Z',
        level=ErrorLevel.ERROR,
        source=ErrorSource.PYTHON,
        component='ExampleComponent',
        operation='example_operation',
        message='This is an example error message',
        stack_trace='Traceback (most recent call last):\n  File "example.py", line 10, in example_operation\n    raise ValueError("Example error")\nValueError: Example error',
        details={'context': 'This happened during testing'},
        metadata={'python_version': sys.version, 'platform': sys.platform},
        tags=['example', 'test', 'documentation']
    )
    
    # Report the error
    result = reporter.create_issue(error)
    
    if result:
        print(f"✓ Issue would be created: {result}")
    else:
        print("✗ Issue was not created (check configuration)")
    
    print()
    print(f"Statistics: {reporter.get_stats()}")
    print()
    
    # Example 2: Using the ErrorMonitor integration
    print("Example 2: ErrorMonitor integration")
    print("-" * 60)
    
    # Configure error monitor with GitHub reporting
    monitor_config = {
        'enable_github_reporting': True,
        'github_config': {
            'enabled': True,
            'github_token': os.getenv('GITHUB_TOKEN', 'test_token'),
            'repository': os.getenv('GITHUB_REPOSITORY', 'owner/repo'),
            'min_error_level': ErrorLevel.ERROR,
            'dry_run': True
        }
    }
    
    monitor = ErrorMonitor(config=monitor_config)
    await monitor.start()
    
    # Simulate an exception
    try:
        # This will raise an exception
        raise ValueError("This is an example exception from the error monitor")
    except Exception as e:
        # Add to error monitor (will automatically report to GitHub)
        error_id = await monitor.add_exception(
            e,
            component='ExampleComponent',
            operation='example_operation',
            source=ErrorSource.PYTHON,
            level=ErrorLevel.ERROR,
            details={'context': 'Testing error monitor integration'}
        )
        
        print(f"✓ Exception added to error monitor: {error_id}")
        
        # Give the monitor time to process
        await asyncio.sleep(2)
        
        # Get the error details
        error_data = await monitor.get_error(error_id)
        if error_data and 'github_issue_url' in error_data.metadata:
            print(f"✓ GitHub issue URL: {error_data.metadata['github_issue_url']}")
        else:
            print("✓ Error processed (dry run mode - no actual issue created)")
    
    await monitor.stop()
    
    print()
    print("=" * 60)
    print("Examples completed!")
    print()
    print("To enable actual GitHub issue creation:")
    print("1. Set GITHUB_TOKEN environment variable")
    print("2. Set GITHUB_REPOSITORY environment variable")
    print("3. Set GITHUB_ISSUE_REPORTER_ENABLED=true")
    print("4. Remove GITHUB_ISSUE_DRY_RUN or set it to false")
    print("=" * 60)


if __name__ == '__main__':
    asyncio.run(main())
