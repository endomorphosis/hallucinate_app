/**
 * GitHub Issue Reporter (JavaScript)
 * 
 * Automatically creates GitHub issues from runtime errors.
 * Integrates with error handling in Node.js/Electron applications.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Configuration for GitHub issue reporting
 */
class IssueReportConfig {
  constructor(options = {}) {
    this.enabled = options.enabled ?? (process.env.GITHUB_ISSUE_REPORTER_ENABLED === 'true');
    this.githubToken = options.githubToken ?? process.env.GITHUB_TOKEN;
    this.repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    this.minErrorLevel = options.minErrorLevel ?? process.env.GITHUB_ISSUE_MIN_LEVEL ?? 'error';
    this.rateLimitPerHour = options.rateLimitPerHour ?? parseInt(process.env.GITHUB_ISSUE_RATE_LIMIT || '10');
    this.duplicateCheckWindowHours = options.duplicateCheckWindowHours ?? parseInt(process.env.GITHUB_ISSUE_DUPLICATE_WINDOW || '24');
    this.issueLabels = options.issueLabels ?? (process.env.GITHUB_ISSUE_LABELS || 'auto-reported,bug').split(',');
    this.assignees = options.assignees ?? (process.env.GITHUB_ISSUE_ASSIGNEES || '').split(',').filter(a => a);
    this.autoAssign = options.autoAssign ?? (process.env.GITHUB_ISSUE_AUTO_ASSIGN === 'true');
    this.includeStackTrace = options.includeStackTrace ?? (process.env.GITHUB_ISSUE_INCLUDE_STACK !== 'false');
    this.includeSystemInfo = options.includeSystemInfo ?? (process.env.GITHUB_ISSUE_INCLUDE_SYSTEM_INFO !== 'false');
    this.dryRun = options.dryRun ?? (process.env.GITHUB_ISSUE_DRY_RUN === 'true');
  }
}

/**
 * Error levels enum
 */
const ErrorLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  FATAL: 'fatal'
};

/**
 * Error sources enum
 */
const ErrorSource = {
  JAVASCRIPT: 'javascript',
  NODEJS: 'nodejs',
  ELECTRON: 'electron',
  MCP_SERVER: 'mcp-server',
  DASHBOARD: 'dashboard',
  UNKNOWN: 'unknown'
};

/**
 * GitHub Issue Reporter
 * 
 * Features:
 * - Duplicate detection using error fingerprinting
 * - Rate limiting to prevent API abuse
 * - Configurable severity filtering
 * - Rich issue formatting with stack traces
 */
class GitHubIssueReporter {
  constructor(config = null) {
    this.config = config || new IssueReportConfig();
    
    // Track reported issues to prevent duplicates
    this.reportedFingerprints = new Set();
    this.fingerprintTimestamps = new Map();
    
    // Rate limiting
    this.issueCountPerHour = [];
    
    // Statistics
    this.stats = {
      totalErrorsProcessed: 0,
      issuesCreated: 0,
      duplicatesSkipped: 0,
      rateLimited: 0,
      errors: 0
    };
    
    // Initialize Octokit if available
    this.octokit = null;
    if (this.config.enabled) {
      this._initOctokit();
    }
  }
  
  /**
   * Initialize the Octokit GitHub API client
   * @private
   */
  async _initOctokit() {
    if (!this.config.githubToken) {
      console.error('GitHub token not configured');
      return;
    }
    
    if (!this.config.repository) {
      console.error('GitHub repository not configured');
      return;
    }
    
    try {
      // Dynamic import of @octokit/rest
      const { Octokit } = await import('@octokit/rest');
      
      this.octokit = new Octokit({
        auth: this.config.githubToken
      });
      
      // Parse repository
      const [owner, repo] = this.config.repository.split('/');
      this.owner = owner;
      this.repo = repo;
      
      console.log(`GitHub client initialized for repository: ${this.config.repository}`);
    } catch (error) {
      console.error('Failed to initialize GitHub client:', error.message);
      console.error('Install @octokit/rest with: npm install @octokit/rest');
      this.octokit = null;
    }
  }
  
  /**
   * Generate a unique fingerprint for an error
   * @param {Object} error - Error data
   * @returns {string} SHA256 hash of error characteristics
   */
  generateErrorFingerprint(error) {
    // Create fingerprint from error type, component, and message
    const fingerprintData = `${error.level}:${error.source}:${error.component}:${error.message.substring(0, 200)}`;
    return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
  }
  
  /**
   * Check if an error with this fingerprint was recently reported
   * @param {string} fingerprint - Error fingerprint
   * @returns {boolean} True if duplicate
   */
  isDuplicate(fingerprint) {
    if (!this.fingerprintTimestamps.has(fingerprint)) {
      return false;
    }
    
    // Check if the fingerprint is within the duplicate check window
    const lastReported = this.fingerprintTimestamps.get(fingerprint);
    const windowMs = this.config.duplicateCheckWindowHours * 3600 * 1000;
    
    if (Date.now() - lastReported < windowMs) {
      return true;
    }
    
    // Clean up old fingerprint
    this.fingerprintTimestamps.delete(fingerprint);
    this.reportedFingerprints.delete(fingerprint);
    return false;
  }
  
  /**
   * Check if we've hit the rate limit
   * @returns {boolean} True if within rate limit, False if exceeded
   */
  checkRateLimit() {
    // Clean up old timestamps (older than 1 hour)
    const now = Date.now();
    this.issueCountPerHour = this.issueCountPerHour.filter(
      ts => now - ts < 3600000
    );
    
    return this.issueCountPerHour.length < this.config.rateLimitPerHour;
  }
  
  /**
   * Format the issue title
   * @param {Object} error - Error data
   * @returns {string} Formatted issue title
   */
  formatIssueTitle(error) {
    // Extract error type from metadata or name
    const errorType = error.metadata?.errorType || error.name || 'Error';
    
    // Create concise title
    let title = `[${error.level.toUpperCase()}] ${errorType} in ${error.component}`;
    
    // Truncate if too long
    if (title.length > 80) {
      title = title.substring(0, 77) + '...';
    }
    
    return title;
  }
  
  /**
   * Format the issue body with error details
   * @param {Object} error - Error data
   * @returns {string} Formatted issue body in Markdown
   */
  formatIssueBody(error) {
    const lines = [];
    
    // Header
    lines.push('## Auto-Generated Error Report');
    lines.push('');
    lines.push(`**Error ID:** \`${error.id}\``);
    lines.push(`**Timestamp:** ${error.timestamp}`);
    lines.push(`**Level:** \`${error.level}\``);
    lines.push(`**Source:** \`${error.source}\``);
    lines.push(`**Component:** \`${error.component}\``);
    lines.push(`**Operation:** \`${error.operation}\``);
    lines.push('');
    
    // Error message
    lines.push('### Error Message');
    lines.push('```');
    lines.push(error.message);
    lines.push('```');
    lines.push('');
    
    // Stack trace
    if (this.config.includeStackTrace && error.stackTrace) {
      lines.push('### Stack Trace');
      lines.push('```');
      lines.push(error.stackTrace);
      lines.push('```');
      lines.push('');
    }
    
    // Details
    if (error.details && Object.keys(error.details).length > 0) {
      lines.push('### Additional Details');
      lines.push('```json');
      lines.push(JSON.stringify(error.details, null, 2));
      lines.push('```');
      lines.push('');
    }
    
    // System info
    if (this.config.includeSystemInfo && error.metadata && Object.keys(error.metadata).length > 0) {
      lines.push('### System Information');
      for (const [key, value] of Object.entries(error.metadata)) {
        lines.push(`- **${key}:** \`${value}\``);
      }
      lines.push('');
    }
    
    // Tags
    if (error.tags && error.tags.length > 0) {
      lines.push('### Tags');
      lines.push(error.tags.map(tag => `\`${tag}\``).join(', '));
      lines.push('');
    }
    
    // Occurrence info
    if (error.count && error.count > 1) {
      lines.push('### Occurrence Information');
      lines.push(`- **Total occurrences:** ${error.count}`);
      if (error.firstSeen) lines.push(`- **First seen:** ${error.firstSeen}`);
      if (error.lastSeen) lines.push(`- **Last seen:** ${error.lastSeen}`);
      lines.push('');
    }
    
    // Footer
    lines.push('---');
    lines.push('*This issue was automatically generated by the error monitoring system.*');
    
    return lines.join('\n');
  }
  
  /**
   * Determine if an error should be reported to GitHub
   * @param {Object} error - Error data
   * @returns {boolean} True if error should be reported
   */
  shouldReportError(error) {
    // Check if reporting is enabled
    if (!this.config.enabled) {
      return false;
    }
    
    // Check if GitHub client is initialized
    if (!this.octokit) {
      return false;
    }
    
    // Check error level
    const errorLevels = [ErrorLevel.DEBUG, ErrorLevel.INFO, ErrorLevel.WARNING, ErrorLevel.ERROR, ErrorLevel.FATAL];
    const minLevelIndex = errorLevels.indexOf(this.config.minErrorLevel);
    const errorLevelIndex = errorLevels.indexOf(error.level);
    
    if (errorLevelIndex < minLevelIndex) {
      return false;
    }
    
    // Check for duplicates
    const fingerprint = this.generateErrorFingerprint(error);
    if (this.isDuplicate(fingerprint)) {
      this.stats.duplicatesSkipped++;
      console.debug(`Skipping duplicate error: ${fingerprint}`);
      return false;
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      this.stats.rateLimited++;
      console.warn('GitHub issue rate limit exceeded');
      return false;
    }
    
    return true;
  }
  
  /**
   * Create a GitHub issue for the error
   * @param {Object} error - Error data
   * @returns {Promise<string|null>} Issue URL if created, null otherwise
   */
  async createIssue(error) {
    this.stats.totalErrorsProcessed++;
    
    // Check if we should report this error
    if (!this.shouldReportError(error)) {
      return null;
    }
    
    try {
      // Format issue
      const title = this.formatIssueTitle(error);
      const body = this.formatIssueBody(error);
      
      // Dry run mode
      if (this.config.dryRun) {
        console.log(`DRY RUN - Would create issue: ${title}`);
        console.debug(`Issue body:\n${body}`);
        this.stats.issuesCreated++;
        return 'dry-run-issue-url';
      }
      
      // Create issue
      const response = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: title,
        body: body,
        labels: this.config.issueLabels,
        assignees: this.config.autoAssign ? this.config.assignees : undefined
      });
      
      // Track this issue
      const fingerprint = this.generateErrorFingerprint(error);
      this.reportedFingerprints.add(fingerprint);
      this.fingerprintTimestamps.set(fingerprint, Date.now());
      this.issueCountPerHour.push(Date.now());
      
      this.stats.issuesCreated++;
      
      console.log(`Created GitHub issue: ${response.data.html_url}`);
      return response.data.html_url;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`Failed to create GitHub issue:`, error);
      return null;
    }
  }
  
  /**
   * Get reporter statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      config: {
        enabled: this.config.enabled,
        repository: this.config.repository,
        minErrorLevel: this.config.minErrorLevel,
        rateLimitPerHour: this.config.rateLimitPerHour,
        dryRun: this.config.dryRun
      },
      currentRate: this.issueCountPerHour.length,
      trackedFingerprints: this.reportedFingerprints.size
    };
  }
  
  /**
   * Create an error object from an Error instance
   * @param {Error} err - JavaScript Error object
   * @param {Object} options - Additional options
   * @returns {Object} Error data object
   */
  static createErrorFromException(err, options = {}) {
    const {
      component = 'unknown',
      operation = 'unknown',
      source = ErrorSource.JAVASCRIPT,
      level = ErrorLevel.ERROR,
      details = {}
    } = options;
    
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level: level,
      source: source,
      component: component,
      operation: operation,
      message: err.message,
      name: err.name,
      stackTrace: err.stack,
      details: details,
      metadata: {
        errorType: err.name,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      tags: [component.toLowerCase(), source, level],
      count: 1
    };
  }
}

// Singleton instance
let reporterInstance = null;

/**
 * Get the singleton GitHub issue reporter instance
 * @param {IssueReportConfig} config - Optional configuration (only used on first call)
 * @returns {GitHubIssueReporter} The reporter instance
 */
export function getReporter(config = null) {
  if (!reporterInstance) {
    reporterInstance = new GitHubIssueReporter(config);
  }
  return reporterInstance;
}

/**
 * Convenience function to report an error
 * @param {Object} error - Error data
 * @returns {Promise<string|null>} Issue URL if created
 */
export async function reportError(error) {
  const reporter = getReporter();
  return await reporter.createIssue(error);
}

/**
 * Convenience function to report an Error exception
 * @param {Error} err - JavaScript Error object
 * @param {Object} options - Additional options
 * @returns {Promise<string|null>} Issue URL if created
 */
export async function reportException(err, options = {}) {
  const error = GitHubIssueReporter.createErrorFromException(err, options);
  return await reportError(error);
}

export { GitHubIssueReporter, IssueReportConfig, ErrorLevel, ErrorSource };
export default GitHubIssueReporter;
