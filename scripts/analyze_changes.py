#!/usr/bin/env python3
"""
Analyze code changes over a specified time period and generate a report.

This script analyzes git commits, file changes, and code patterns to identify
areas where documentation may need updates.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Set
import subprocess
import re


class ChangeAnalyzer:
    """Analyzes repository changes and generates documentation insights."""
    
    def __init__(self, repo_path: str = "."):
        self.repo_path = Path(repo_path)
        self.changes = {
            "period": {},
            "files": {},
            "modules": {},
            "features": [],
            "breaking_changes": [],
            "new_files": [],
            "deleted_files": [],
            "modified_files": []
        }
    
    def analyze(self, days: int = 7) -> Dict:
        """Analyze changes over the specified number of days."""
        since_date = datetime.now() - timedelta(days=days)
        since_str = since_date.strftime("%Y-%m-%d")
        
        self.changes["period"] = {
            "days": days,
            "since": since_str,
            "until": datetime.now().strftime("%Y-%m-%d")
        }
        
        # Get commit history
        commits = self._get_commits(since_str)
        self.changes["commits"] = len(commits)
        self.changes["commit_details"] = commits[:10]  # Top 10 recent
        
        # Analyze file changes
        self._analyze_file_changes(since_str)
        
        # Identify new features and breaking changes
        self._identify_features(commits)
        
        # Analyze documentation gaps
        self._identify_documentation_gaps()
        
        # Generate recommendations
        self.changes["recommendations"] = self._generate_recommendations()
        
        return self.changes
    
    def _get_commits(self, since: str) -> List[Dict]:
        """Get commit history since specified date."""
        try:
            cmd = [
                "git", "log",
                f"--since={since}",
                "--pretty=format:%H|%an|%ae|%ad|%s",
                "--date=iso"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.repo_path)
            
            commits = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('|', 4)
                if len(parts) == 5:
                    commits.append({
                        "hash": parts[0],
                        "author": parts[1],
                        "email": parts[2],
                        "date": parts[3],
                        "message": parts[4]
                    })
            
            return commits
        except Exception as e:
            print(f"Error getting commits: {e}", file=sys.stderr)
            return []
    
    def _analyze_file_changes(self, since: str):
        """Analyze file changes."""
        try:
            # Get changed files
            cmd = ["git", "diff", f"--since={since}", "--name-status", "HEAD~1", "HEAD"]
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.repo_path)
            
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('\t', 1)
                if len(parts) == 2:
                    status, filepath = parts
                    
                    if status == 'A':
                        self.changes["new_files"].append(filepath)
                    elif status == 'D':
                        self.changes["deleted_files"].append(filepath)
                    elif status.startswith('M'):
                        self.changes["modified_files"].append(filepath)
            
            # Get file statistics
            cmd = ["git", "log", f"--since={since}", "--numstat", "--pretty=format:"]
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=self.repo_path)
            
            file_stats = {}
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('\t')
                if len(parts) == 3:
                    added, removed, filepath = parts
                    if filepath not in file_stats:
                        file_stats[filepath] = {"added": 0, "removed": 0, "changes": 0}
                    
                    try:
                        file_stats[filepath]["added"] += int(added) if added != '-' else 0
                        file_stats[filepath]["removed"] += int(removed) if removed != '-' else 0
                        file_stats[filepath]["changes"] += 1
                    except ValueError:
                        pass
            
            # Get top changed files
            sorted_files = sorted(
                file_stats.items(),
                key=lambda x: x[1]["added"] + x[1]["removed"],
                reverse=True
            )
            
            self.changes["files"] = {
                "total": len(file_stats),
                "top_changed": [
                    {"path": path, **stats}
                    for path, stats in sorted_files[:20]
                ]
            }
            
            # Categorize by file type
            self._categorize_files(file_stats)
            
        except Exception as e:
            print(f"Error analyzing file changes: {e}", file=sys.stderr)
    
    def _categorize_files(self, file_stats: Dict):
        """Categorize files by type and module."""
        categories = {
            "javascript": [],
            "python": [],
            "documentation": [],
            "configuration": [],
            "tests": [],
            "other": []
        }
        
        modules = set()
        
        for filepath in file_stats.keys():
            # Identify module
            if '/' in filepath:
                module = filepath.split('/')[0]
                modules.add(module)
            
            # Categorize by extension
            if filepath.endswith(('.js', '.cjs', '.mjs')):
                categories["javascript"].append(filepath)
            elif filepath.endswith('.py'):
                categories["python"].append(filepath)
            elif filepath.endswith('.md'):
                categories["documentation"].append(filepath)
            elif filepath.endswith(('.json', '.toml', '.yaml', '.yml', '.conf')):
                categories["configuration"].append(filepath)
            elif 'test' in filepath.lower() or filepath.startswith('test/'):
                categories["tests"].append(filepath)
            else:
                categories["other"].append(filepath)
        
        self.changes["file_categories"] = {
            k: len(v) for k, v in categories.items()
        }
        self.changes["modules"] = list(modules)
    
    def _identify_features(self, commits: List[Dict]):
        """Identify new features and breaking changes from commit messages."""
        feature_keywords = ['feat', 'feature', 'add', 'new', 'implement']
        breaking_keywords = ['breaking', 'break', 'remove', 'deprecate']
        
        for commit in commits:
            msg = commit["message"].lower()
            
            # Check for features
            if any(kw in msg for kw in feature_keywords):
                self.changes["features"].append({
                    "commit": commit["hash"][:8],
                    "message": commit["message"],
                    "date": commit["date"]
                })
            
            # Check for breaking changes
            if any(kw in msg for kw in breaking_keywords):
                self.changes["breaking_changes"].append({
                    "commit": commit["hash"][:8],
                    "message": commit["message"],
                    "date": commit["date"]
                })
    
    def _identify_documentation_gaps(self):
        """Identify potential documentation gaps."""
        gaps = []
        
        # Check for new files without documentation
        code_files = [
            f for f in self.changes["new_files"]
            if f.endswith(('.js', '.py')) and 'test' not in f.lower()
        ]
        
        for code_file in code_files:
            # Check if corresponding doc exists
            base_name = Path(code_file).stem
            potential_docs = [
                f"docs/{base_name}.md",
                f"docs/{base_name.upper()}.md",
                f"{Path(code_file).parent}/README.md"
            ]
            
            doc_exists = any((self.repo_path / doc).exists() for doc in potential_docs)
            
            if not doc_exists:
                gaps.append({
                    "file": code_file,
                    "type": "new_code_without_docs",
                    "suggestion": f"Consider adding documentation for {code_file}"
                })
        
        # Check for modified files with outdated docs
        for modified_file in self.changes["modified_files"]:
            if modified_file.endswith(('.js', '.py')):
                # Find related doc file
                parts = Path(modified_file).parts
                if len(parts) > 1:
                    module = parts[0]
                    doc_path = self.repo_path / "docs" / f"{module}.md"
                    
                    if doc_path.exists():
                        # Check if doc was also modified
                        if str(doc_path) not in self.changes["modified_files"]:
                            gaps.append({
                                "file": modified_file,
                                "type": "code_modified_doc_not_updated",
                                "suggestion": f"Consider updating documentation for {modified_file}"
                            })
        
        self.changes["documentation_gaps"] = gaps
    
    def _generate_recommendations(self) -> List[Dict]:
        """Generate documentation update recommendations."""
        recommendations = []
        
        # Recommend updates based on features
        if self.changes["features"]:
            recommendations.append({
                "priority": "high",
                "category": "features",
                "title": "Document New Features",
                "description": f"{len(self.changes['features'])} new features added in the past week",
                "action": "Update feature documentation and changelog"
            })
        
        # Recommend updates based on breaking changes
        if self.changes["breaking_changes"]:
            recommendations.append({
                "priority": "critical",
                "category": "breaking_changes",
                "title": "Document Breaking Changes",
                "description": f"{len(self.changes['breaking_changes'])} breaking changes detected",
                "action": "Update migration guide and changelog with breaking changes"
            })
        
        # Recommend updates based on documentation gaps
        if self.changes["documentation_gaps"]:
            recommendations.append({
                "priority": "medium",
                "category": "documentation_gaps",
                "title": "Address Documentation Gaps",
                "description": f"{len(self.changes['documentation_gaps'])} files need documentation",
                "action": "Add or update documentation for modified code"
            })
        
        # Recommend updates based on new modules
        new_modules = [
            m for m in self.changes["modules"]
            if not (self.repo_path / "docs" / f"{m}.md").exists()
        ]
        
        if new_modules:
            recommendations.append({
                "priority": "medium",
                "category": "new_modules",
                "title": "Document New Modules",
                "description": f"{len(new_modules)} new modules without documentation",
                "action": f"Create documentation for: {', '.join(new_modules[:5])}"
            })
        
        return recommendations


def main():
    parser = argparse.ArgumentParser(
        description="Analyze code changes and identify documentation needs"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to look back (default: 7)"
    )
    parser.add_argument(
        "--output-format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)"
    )
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Path to git repository (default: current directory)"
    )
    
    args = parser.parse_args()
    
    analyzer = ChangeAnalyzer(args.repo_path)
    results = analyzer.analyze(args.days)
    
    if args.output_format == "json":
        print(json.dumps(results, indent=2))
    else:
        print(f"Analysis Period: {results['period']['since']} to {results['period']['until']}")
        print(f"Total Commits: {results['commits']}")
        print(f"Files Changed: {results['files']['total']}")
        print(f"New Features: {len(results['features'])}")
        print(f"Breaking Changes: {len(results['breaking_changes'])}")
        print(f"Documentation Gaps: {len(results['documentation_gaps'])}")
        print("\nRecommendations:")
        for rec in results['recommendations']:
            print(f"  [{rec['priority'].upper()}] {rec['title']}")
            print(f"    {rec['description']}")


if __name__ == "__main__":
    main()
