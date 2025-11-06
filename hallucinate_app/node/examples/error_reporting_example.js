#!/usr/bin/env node
/**
 * Example: Auto Error Reporting (JavaScript)
 * 
 * Demonstrates how the auto error reporting system works in JavaScript.
 * Run this with GITHUB_ISSUE_DRY_RUN=true to test without creating issues.
 */

import {
  GitHubIssueReporter,
  IssueReportConfig,
  getReporter,
  reportError,
  reportException,
  ErrorLevel,
  ErrorSource
} from '../../node/github_issue_reporter.js';

async function main() {
  console.log('='.repeat(60));
  console.log('Auto Error Reporting Example (JavaScript)');
  console.log('='.repeat(60));
  console.log();
  
  // Example 1: Direct use of the GitHub reporter
  console.log('Example 1: Direct GitHub reporter usage');
  console.log('-'.repeat(60));
  
  // Configure for dry run mode
  const config = new IssueReportConfig({
    enabled: true,
    githubToken: process.env.GITHUB_TOKEN || 'test_token',
    repository: process.env.GITHUB_REPOSITORY || 'owner/repo',
    minErrorLevel: ErrorLevel.ERROR,
    dryRun: true  // Safe for testing
  });
  
  const reporter = new GitHubIssueReporter(config);
  
  // Create a sample error
  const error = {
    id: 'example-js-001',
    timestamp: new Date().toISOString(),
    level: ErrorLevel.ERROR,
    source: ErrorSource.JAVASCRIPT,
    component: 'ExampleComponent',
    operation: 'example_operation',
    message: 'This is an example error message from JavaScript',
    stackTrace: 'Error: Example error\n    at example.js:10:15\n    at main (example.js:5:3)',
    details: { context: 'This happened during testing' },
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    tags: ['example', 'test', 'documentation', 'javascript']
  };
  
  // Report the error
  const result = await reporter.createIssue(error);
  
  if (result) {
    console.log(`✓ Issue would be created: ${result}`);
  } else {
    console.log('✗ Issue was not created (check configuration)');
  }
  
  console.log();
  console.log('Statistics:', reporter.getStats());
  console.log();
  
  // Example 2: Using reportException helper
  console.log('Example 2: Using reportException helper');
  console.log('-'.repeat(60));
  
  try {
    // This will throw an error
    throw new Error('This is an example exception from JavaScript');
  } catch (err) {
    // Report the exception
    const issueUrl = await reportException(err, {
      component: 'ExampleComponent',
      operation: 'example_operation',
      source: ErrorSource.NODEJS,
      level: ErrorLevel.ERROR,
      details: { context: 'Testing reportException helper' }
    });
    
    if (issueUrl) {
      console.log(`✓ Exception reported: ${issueUrl}`);
    } else {
      console.log('✓ Exception processed (dry run mode - no actual issue created)');
    }
  }
  
  console.log();
  
  // Example 3: Demonstrating duplicate detection
  console.log('Example 3: Duplicate detection');
  console.log('-'.repeat(60));
  
  const duplicateError = {
    id: 'example-js-002',
    timestamp: new Date().toISOString(),
    level: ErrorLevel.ERROR,
    source: ErrorSource.JAVASCRIPT,
    component: 'ExampleComponent',
    operation: 'example_operation',
    message: 'This is an example error message from JavaScript',  // Same message as before
    stackTrace: 'Error: Example error\n    at example.js:10:15',
    tags: ['example', 'test']
  };
  
  const result1 = await reporter.createIssue(duplicateError);
  console.log(`First attempt: ${result1 ? 'Created' : 'Not created'}`);
  
  const result2 = await reporter.createIssue(duplicateError);
  console.log(`Second attempt (duplicate): ${result2 ? 'Created' : 'Not created (duplicate detected)'}`);
  
  console.log();
  console.log('Updated statistics:', reporter.getStats());
  
  console.log();
  console.log('='.repeat(60));
  console.log('Examples completed!');
  console.log();
  console.log('To enable actual GitHub issue creation:');
  console.log('1. Set GITHUB_TOKEN environment variable');
  console.log('2. Set GITHUB_REPOSITORY environment variable');
  console.log('3. Set GITHUB_ISSUE_REPORTER_ENABLED=true');
  console.log('4. Remove GITHUB_ISSUE_DRY_RUN or set it to false');
  console.log('='.repeat(60));
}

// Run the examples
main().catch(err => {
  console.error('Error running examples:', err);
  process.exit(1);
});
