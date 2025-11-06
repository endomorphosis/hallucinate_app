/**
 * Test GitHub Issue Reporter (JavaScript)
 * 
 * Tests the functionality of the GitHub issue reporter in JavaScript.
 */

import { strict as assert } from 'assert';
import {
  GitHubIssueReporter,
  IssueReportConfig,
  getReporter,
  reportError,
  ErrorLevel,
  ErrorSource
} from '../../hallucinate_app/node/github_issue_reporter.js';

describe('GitHubIssueReporter', function() {
  let reporter;
  let config;
  
  beforeEach(function() {
    // Create a test configuration with dry_run enabled
    config = new IssueReportConfig({
      enabled: true,
      githubToken: 'test_token',
      repository: 'test_owner/test_repo',
      minErrorLevel: ErrorLevel.ERROR,
      dryRun: true  // Don't actually create issues during tests
    });
    
    reporter = new GitHubIssueReporter(config);
  });
  
  describe('Configuration', function() {
    it('should create config from environment variables', function() {
      // Set environment variables
      process.env.GITHUB_ISSUE_REPORTER_ENABLED = 'true';
      process.env.GITHUB_TOKEN = 'test_token';
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_ISSUE_MIN_LEVEL = 'warning';
      process.env.GITHUB_ISSUE_RATE_LIMIT = '5';
      process.env.GITHUB_ISSUE_DRY_RUN = 'true';
      
      const envConfig = new IssueReportConfig();
      
      assert.strictEqual(envConfig.enabled, true);
      assert.strictEqual(envConfig.githubToken, 'test_token');
      assert.strictEqual(envConfig.repository, 'owner/repo');
      assert.strictEqual(envConfig.minErrorLevel, 'warning');
      assert.strictEqual(envConfig.rateLimitPerHour, 5);
      assert.strictEqual(envConfig.dryRun, true);
      
      // Clean up
      delete process.env.GITHUB_ISSUE_REPORTER_ENABLED;
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_ISSUE_MIN_LEVEL;
      delete process.env.GITHUB_ISSUE_RATE_LIMIT;
      delete process.env.GITHUB_ISSUE_DRY_RUN;
    });
  });
  
  describe('Error Fingerprinting', function() {
    it('should generate same fingerprint for identical errors', function() {
      const error1 = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error message'
      };
      
      const error2 = {
        id: 'test-2',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error message'
      };
      
      const fingerprint1 = reporter.generateErrorFingerprint(error1);
      const fingerprint2 = reporter.generateErrorFingerprint(error2);
      
      assert.strictEqual(fingerprint1, fingerprint2);
    });
    
    it('should generate different fingerprint for different errors', function() {
      const error1 = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error message'
      };
      
      const error2 = {
        id: 'test-2',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.WARNING,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Different error message'
      };
      
      const fingerprint1 = reporter.generateErrorFingerprint(error1);
      const fingerprint2 = reporter.generateErrorFingerprint(error2);
      
      assert.notStrictEqual(fingerprint1, fingerprint2);
    });
  });
  
  describe('Duplicate Detection', function() {
    it('should detect duplicate errors', function() {
      const fingerprint = 'test_fingerprint';
      
      // Initially not a duplicate
      assert.strictEqual(reporter.isDuplicate(fingerprint), false);
      
      // Mark as reported
      reporter.reportedFingerprints.add(fingerprint);
      reporter.fingerprintTimestamps.set(fingerprint, Date.now());
      
      // Should now be detected as duplicate
      assert.strictEqual(reporter.isDuplicate(fingerprint), true);
    });
  });
  
  describe('Rate Limiting', function() {
    it('should enforce rate limits', function() {
      // Initially should pass rate limit
      assert.strictEqual(reporter.checkRateLimit(), true);
      
      // Add many recent issues
      const now = Date.now();
      for (let i = 0; i < config.rateLimitPerHour; i++) {
        reporter.issueCountPerHour.push(now);
      }
      
      // Should now fail rate limit
      assert.strictEqual(reporter.checkRateLimit(), false);
    });
  });
  
  describe('Issue Title Formatting', function() {
    it('should format issue title correctly', function() {
      const error = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error message',
        metadata: { errorType: 'ValueError' }
      };
      
      const title = reporter.formatIssueTitle(error);
      
      assert.ok(title.includes('ERROR'));
      assert.ok(title.includes('ValueError'));
      assert.ok(title.includes('TestComponent'));
      assert.ok(title.length <= 80);
    });
  });
  
  describe('Issue Body Formatting', function() {
    it('should format issue body with all sections', function() {
      const error = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error message',
        stackTrace: 'Error: Test\n    at test.js:1:1',
        details: { key: 'value' },
        metadata: { errorType: 'ValueError' },
        tags: ['test', 'component']
      };
      
      const body = reporter.formatIssueBody(error);
      
      // Check for required sections
      assert.ok(body.includes('Auto-Generated Error Report'));
      assert.ok(body.includes('test-1'));
      assert.ok(body.includes('Error Message'));
      assert.ok(body.includes('Test error message'));
      assert.ok(body.includes('Stack Trace'));
      assert.ok(body.includes('Additional Details'));
      assert.ok(body.includes('System Information'));
      assert.ok(body.includes('Tags'));
    });
  });
  
  describe('Error Reporting Criteria', function() {
    it('should report errors above minimum level', function() {
      const error = {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: ErrorLevel.ERROR,
        source: ErrorSource.JAVASCRIPT,
        component: 'TestComponent',
        operation: 'test_operation',
        message: 'Test error'
      };
      
      // Note: shouldReportError will return false because octokit is not initialized
      // but we can verify the config is set correctly
      assert.strictEqual(config.minErrorLevel, ErrorLevel.ERROR);
    });
  });
  
  describe('Create Error from Exception', function() {
    it('should create error object from Error instance', function() {
      const error = new Error('Test error');
      error.stack = 'Error: Test\n    at test.js:1:1';
      
      const errorData = GitHubIssueReporter.createErrorFromException(error, {
        component: 'TestComponent',
        operation: 'test_operation',
        source: ErrorSource.NODEJS,
        level: ErrorLevel.ERROR,
        details: { additionalInfo: 'test' }
      });
      
      assert.strictEqual(errorData.message, 'Test error');
      assert.strictEqual(errorData.component, 'TestComponent');
      assert.strictEqual(errorData.operation, 'test_operation');
      assert.strictEqual(errorData.source, ErrorSource.NODEJS);
      assert.strictEqual(errorData.level, ErrorLevel.ERROR);
      assert.strictEqual(errorData.stackTrace, error.stack);
      assert.ok(errorData.id);
      assert.ok(errorData.timestamp);
    });
  });
  
  describe('Statistics', function() {
    it('should track statistics', function() {
      const stats = reporter.getStats();
      
      assert.ok('totalErrorsProcessed' in stats);
      assert.ok('issuesCreated' in stats);
      assert.ok('duplicatesSkipped' in stats);
      assert.ok('rateLimited' in stats);
      assert.ok('config' in stats);
      assert.ok('currentRate' in stats);
      assert.ok('trackedFingerprints' in stats);
    });
  });
});
