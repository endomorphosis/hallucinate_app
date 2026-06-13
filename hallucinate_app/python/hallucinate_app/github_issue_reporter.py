"""
GitHub Issue Reporter

Automatically creates GitHub issues from runtime errors.
Integrates with the ErrorMonitor system to report errors to GitHub Issues.
"""

import os
import json
import hashlib
import logging
import time
from typing import Dict, List, Optional, Any, Set
from datetime import datetime, timedelta
from dataclasses import dataclass, field

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("github_issue_reporter")

try:
    from github import Github, GithubException
    GITHUB_AVAILABLE = True
except ImportError:
    GITHUB_AVAILABLE = False
    logger.warning("PyGithub not available. Install with: pip install PyGithub")

from hallucinate_app.error_monitor import ErrorData, ErrorLevel, ErrorSource


@dataclass
class IssueReportConfig:
    """Configuration for GitHub issue reporting"""
    enabled: bool = False
    github_token: Optional[str] = None
    repository: Optional[str] = None  # Format: "owner/repo"
    min_error_level: ErrorLevel = ErrorLevel.ERROR
    rate_limit_per_hour: int = 10
    duplicate_check_window_hours: int = 24
    issue_labels: List[str] = field(default_factory=lambda: ["auto-reported", "bug"])
    assignees: List[str] = field(default_factory=list)
    auto_assign: bool = False
    include_stack_trace: bool = True
    include_system_info: bool = True
    dry_run: bool = False  # If True, log instead of creating issues
    
    @classmethod
    def from_env(cls) -> 'IssueReportConfig':
        """Create configuration from environment variables"""
        return cls(
            enabled=os.getenv('GITHUB_ISSUE_REPORTER_ENABLED', 'false').lower() == 'true',
            github_token=os.getenv('GITHUB_TOKEN'),
            repository=os.getenv('GITHUB_REPOSITORY'),
            min_error_level=ErrorLevel(os.getenv('GITHUB_ISSUE_MIN_LEVEL', 'error')),
            rate_limit_per_hour=int(os.getenv('GITHUB_ISSUE_RATE_LIMIT', '10')),
            duplicate_check_window_hours=int(os.getenv('GITHUB_ISSUE_DUPLICATE_WINDOW', '24')),
            issue_labels=os.getenv('GITHUB_ISSUE_LABELS', 'auto-reported,bug').split(','),
            assignees=os.getenv('GITHUB_ISSUE_ASSIGNEES', '').split(',') if os.getenv('GITHUB_ISSUE_ASSIGNEES') else [],
            auto_assign=os.getenv('GITHUB_ISSUE_AUTO_ASSIGN', 'false').lower() == 'true',
            include_stack_trace=os.getenv('GITHUB_ISSUE_INCLUDE_STACK', 'true').lower() == 'true',
            include_system_info=os.getenv('GITHUB_ISSUE_INCLUDE_SYSTEM_INFO', 'true').lower() == 'true',
            dry_run=os.getenv('GITHUB_ISSUE_DRY_RUN', 'false').lower() == 'true',
        )


class GitHubIssueReporter:
    """
    Automatically creates GitHub issues from errors.
    
    Features:
    - Duplicate detection using error fingerprinting
    - Rate limiting to prevent API abuse
    - Configurable severity filtering
    - Rich issue formatting with stack traces
    """
    
    def __init__(self, config: Optional[IssueReportConfig] = None):
        """
        Initialize the GitHub issue reporter
        
        Args:
            config: Configuration for issue reporting
        """
        self.config = config or IssueReportConfig.from_env()
        
        # Initialize GitHub client
        self.github_client = None
        self.repo = None
        
        if self.config.enabled and GITHUB_AVAILABLE:
            self._init_github_client()
        
        # Track reported issues to prevent duplicates
        self.reported_fingerprints: Set[str] = set()
        self.fingerprint_timestamps: Dict[str, float] = {}
        
        # Rate limiting
        self.issue_count_per_hour: List[float] = []
        
        # Statistics
        self.stats = {
            "total_errors_processed": 0,
            "issues_created": 0,
            "duplicates_skipped": 0,
            "rate_limited": 0,
            "errors": 0
        }
        self.last_issue_error: Optional[Dict[str, Any]] = None
    
    def _init_github_client(self):
        """Initialize the GitHub API client"""
        if not self.config.github_token:
            logger.error("GitHub token not configured")
            return
        
        if not self.config.repository:
            logger.error("GitHub repository not configured")
            return
        
        try:
            self.github_client = Github(self.config.github_token)
            self.repo = self.github_client.get_repo(self.config.repository)
            logger.info(f"GitHub client initialized for repository: {self.config.repository}")
        except Exception as e:
            logger.exception(f"Failed to initialize GitHub client: {e}")
            self.github_client = None
            self.repo = None
    
    def generate_error_fingerprint(self, error: ErrorData) -> str:
        """
        Generate a unique fingerprint for an error
        
        Args:
            error: Error data
            
        Returns:
            str: SHA256 hash of error characteristics
        """
        # Create fingerprint from error type, component, and message
        fingerprint_data = f"{error.level.value}:{error.source.value}:{error.component}:{error.message[:200]}"
        return hashlib.sha256(fingerprint_data.encode()).hexdigest()[:16]
    
    def is_duplicate(self, fingerprint: str) -> bool:
        """
        Check if an error with this fingerprint was recently reported
        
        Args:
            fingerprint: Error fingerprint
            
        Returns:
            bool: True if duplicate
        """
        if fingerprint not in self.fingerprint_timestamps:
            return False
        
        # Check if the fingerprint is within the duplicate check window
        last_reported = self.fingerprint_timestamps[fingerprint]
        window_seconds = self.config.duplicate_check_window_hours * 3600
        
        if time.time() - last_reported < window_seconds:
            return True
        
        # Clean up old fingerprint
        del self.fingerprint_timestamps[fingerprint]
        self.reported_fingerprints.discard(fingerprint)
        return False
    
    def check_rate_limit(self) -> bool:
        """
        Check if we've hit the rate limit
        
        Returns:
            bool: True if within rate limit, False if exceeded
        """
        # Clean up old timestamps (older than 1 hour)
        now = time.time()
        self.issue_count_per_hour = [
            ts for ts in self.issue_count_per_hour 
            if now - ts < 3600
        ]
        
        return len(self.issue_count_per_hour) < self.config.rate_limit_per_hour
    
    def format_issue_title(self, error: ErrorData) -> str:
        """
        Format the issue title
        
        Args:
            error: Error data
            
        Returns:
            str: Formatted issue title
        """
        # Extract error type from message if available
        error_type = error.metadata.get('error_type', 'Error')
        
        # Create concise title
        title = f"[{error.level.value.upper()}] {error_type} in {error.component}"
        
        # Truncate if too long
        if len(title) > 80:
            title = title[:77] + "..."
        
        return title
    
    def format_issue_body(self, error: ErrorData) -> str:
        """
        Format the issue body with error details
        
        Args:
            error: Error data
            
        Returns:
            str: Formatted issue body in Markdown
        """
        lines = []
        
        # Header
        lines.append("## Auto-Generated Error Report")
        lines.append("")
        lines.append(f"**Error ID:** `{error.id}`")
        lines.append(f"**Timestamp:** {error.timestamp}")
        lines.append(f"**Level:** `{error.level.value}`")
        lines.append(f"**Source:** `{error.source.value}`")
        lines.append(f"**Component:** `{error.component}`")
        lines.append(f"**Operation:** `{error.operation}`")
        lines.append("")
        
        # Error message
        lines.append("### Error Message")
        lines.append("```")
        lines.append(error.message)
        lines.append("```")
        lines.append("")
        
        # Stack trace
        if self.config.include_stack_trace and error.stack_trace:
            lines.append("### Stack Trace")
            lines.append("```")
            lines.append(error.stack_trace)
            lines.append("```")
            lines.append("")
        
        # Details
        if error.details:
            lines.append("### Additional Details")
            lines.append("```json")
            lines.append(json.dumps(error.details, indent=2))
            lines.append("```")
            lines.append("")
        
        # System info
        if self.config.include_system_info and error.metadata:
            lines.append("### System Information")
            for key, value in error.metadata.items():
                lines.append(f"- **{key}:** `{value}`")
            lines.append("")
        
        # Tags
        if error.tags:
            lines.append("### Tags")
            lines.append(", ".join([f"`{tag}`" for tag in error.tags]))
            lines.append("")
        
        # Occurrence info
        if error.count > 1:
            lines.append("### Occurrence Information")
            lines.append(f"- **Total occurrences:** {error.count}")
            lines.append(f"- **First seen:** {error.first_seen}")
            lines.append(f"- **Last seen:** {error.last_seen}")
            lines.append("")
        
        # Footer
        lines.append("---")
        lines.append("*This issue was automatically generated by the error monitoring system.*")
        
        return "\n".join(lines)
    
    def should_report_error(self, error: ErrorData) -> bool:
        """
        Determine if an error should be reported to GitHub
        
        Args:
            error: Error data
            
        Returns:
            bool: True if error should be reported
        """
        # Check if reporting is enabled
        if not self.config.enabled:
            return False
        
        # Check if GitHub client is initialized
        if not self.repo:
            return False
        
        # Check error level
        error_levels = [ErrorLevel.DEBUG, ErrorLevel.INFO, ErrorLevel.WARNING, ErrorLevel.ERROR, ErrorLevel.FATAL]
        min_level_index = error_levels.index(self.config.min_error_level)
        error_level_index = error_levels.index(error.level)
        
        if error_level_index < min_level_index:
            return False
        
        # Check for duplicates
        fingerprint = self.generate_error_fingerprint(error)
        if self.is_duplicate(fingerprint):
            self.stats["duplicates_skipped"] += 1
            logger.debug(f"Skipping duplicate error: {fingerprint}")
            return False
        
        # Check rate limit
        if not self.check_rate_limit():
            self.stats["rate_limited"] += 1
            logger.warning("GitHub issue rate limit exceeded")
            return False
        
        return True
    
    def create_issue(self, error: ErrorData) -> Optional[str]:
        """
        Create a GitHub issue for the error
        
        Args:
            error: Error data
            
        Returns:
            Optional[str]: Issue URL if created, None otherwise
        """
        self.stats["total_errors_processed"] += 1
        
        # Check if we should report this error
        if not self.should_report_error(error):
            return None
        
        try:
            # Format issue
            title = self.format_issue_title(error)
            body = self.format_issue_body(error)
            
            # Dry run mode
            if self.config.dry_run:
                logger.info(f"DRY RUN - Would create issue: {title}")
                logger.debug(f"Issue body:\n{body}")
                self.stats["issues_created"] += 1
                return "dry-run-issue-url"
            
            # Create issue
            issue = self.repo.create_issue(
                title=title,
                body=body,
                labels=self.config.issue_labels,
                assignees=self.config.assignees if self.config.auto_assign else None
            )
            
            # Track this issue
            fingerprint = self.generate_error_fingerprint(error)
            self.reported_fingerprints.add(fingerprint)
            self.fingerprint_timestamps[fingerprint] = time.time()
            self.issue_count_per_hour.append(time.time())
            
            self.stats["issues_created"] += 1
            
            logger.info(f"Created GitHub issue: {issue.html_url}")
            return issue.html_url
            
        except Exception as e:
            self.stats["errors"] += 1
            self.last_issue_error = {
                "timestamp": datetime.now().isoformat(),
                "error_id": error.id,
                "error_type": type(e).__name__,
                "message": str(e),
            }
            if GITHUB_AVAILABLE and isinstance(e, GithubException):
                self.last_issue_error["github_status"] = e.status
                logger.error(
                    "Failed to create GitHub issue (API error %s): %s",
                    e.status,
                    e.data,
                    exc_info=True,
                )
            else:
                logger.error("Failed to create GitHub issue: %s", e, exc_info=True)
            return None
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get reporter statistics
        
        Returns:
            dict: Statistics
        """
        return {
            **self.stats,
            "config": {
                "enabled": self.config.enabled,
                "repository": self.config.repository,
                "min_error_level": self.config.min_error_level.value,
                "rate_limit_per_hour": self.config.rate_limit_per_hour,
                "dry_run": self.config.dry_run
            },
            "current_rate": len(self.issue_count_per_hour),
            "tracked_fingerprints": len(self.reported_fingerprints),
            "last_issue_error": self.last_issue_error
        }


# Singleton instance
_reporter_instance = None


def get_reporter(config: Optional[IssueReportConfig] = None) -> GitHubIssueReporter:
    """
    Get the singleton GitHub issue reporter instance
    
    Args:
        config: Optional configuration (only used on first call)
        
    Returns:
        GitHubIssueReporter: The reporter instance
    """
    global _reporter_instance
    
    if _reporter_instance is None:
        _reporter_instance = GitHubIssueReporter(config)
    
    return _reporter_instance


def report_error(error: ErrorData) -> Optional[str]:
    """
    Convenience function to report an error
    
    Args:
        error: Error data
        
    Returns:
        Optional[str]: Issue URL if created
    """
    reporter = get_reporter()
    return reporter.create_issue(error)
