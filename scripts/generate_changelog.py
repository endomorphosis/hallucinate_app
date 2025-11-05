#!/usr/bin/env python3
"""
Generate changelog entries from git commits.
"""

import argparse
import sys
from datetime import datetime, timedelta
import subprocess
from pathlib import Path


def get_commits(days: int, repo_path: str = ".") -> list:
    """Get commits from the specified time period."""
    since_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    try:
        cmd = [
            "git", "log",
            f"--since={since_date}",
            "--pretty=format:%H|%s|%an|%ad",
            "--date=short"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=repo_path)
        
        commits = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split('|', 3)
            if len(parts) == 4:
                commits.append({
                    "hash": parts[0][:8],
                    "message": parts[1],
                    "author": parts[2],
                    "date": parts[3]
                })
        
        return commits
    except Exception as e:
        print(f"Error getting commits: {e}", file=sys.stderr)
        return []


def categorize_commits(commits: list) -> dict:
    """Categorize commits by type."""
    categories = {
        "features": [],
        "fixes": [],
        "docs": [],
        "refactor": [],
        "test": [],
        "chore": [],
        "other": []
    }
    
    for commit in commits:
        msg = commit["message"].lower()
        
        if msg.startswith("feat") or "feature" in msg or "add" in msg:
            categories["features"].append(commit)
        elif msg.startswith("fix") or "bug" in msg:
            categories["fixes"].append(commit)
        elif msg.startswith("docs") or "documentation" in msg:
            categories["docs"].append(commit)
        elif msg.startswith("refactor"):
            categories["refactor"].append(commit)
        elif msg.startswith("test"):
            categories["test"].append(commit)
        elif msg.startswith("chore"):
            categories["chore"].append(commit)
        else:
            categories["other"].append(commit)
    
    return categories


def generate_changelog_entry(commits: list, days: int) -> str:
    """Generate a changelog entry."""
    output = []
    
    # Header
    today = datetime.now()
    week_start = (today - timedelta(days=days)).strftime("%Y-%m-%d")
    week_end = today.strftime("%Y-%m-%d")
    
    output.append(f"## Week of {week_start}")
    output.append("")
    output.append(f"*Period: {week_start} to {week_end}*")
    output.append("")
    
    # Categorize
    categories = categorize_commits(commits)
    
    # Add features
    if categories["features"]:
        output.append("### ✨ Features")
        output.append("")
        for commit in categories["features"]:
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        output.append("")
    
    # Add fixes
    if categories["fixes"]:
        output.append("### 🐛 Bug Fixes")
        output.append("")
        for commit in categories["fixes"]:
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        output.append("")
    
    # Add documentation
    if categories["docs"]:
        output.append("### 📚 Documentation")
        output.append("")
        for commit in categories["docs"]:
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        output.append("")
    
    # Add refactoring
    if categories["refactor"]:
        output.append("### ♻️ Refactoring")
        output.append("")
        for commit in categories["refactor"]:
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        output.append("")
    
    # Add tests
    if categories["test"]:
        output.append("### ✅ Tests")
        output.append("")
        for commit in categories["test"]:
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        output.append("")
    
    # Add other changes
    if categories["other"]:
        output.append("### 🔧 Other Changes")
        output.append("")
        for commit in categories["other"][:10]:  # Limit to 10
            msg = commit["message"].strip()
            output.append(f"- {msg} (`{commit['hash']}`)")
        if len(categories["other"]) > 10:
            output.append(f"- *...and {len(categories['other']) - 10} more commits*")
        output.append("")
    
    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(
        description="Generate changelog entries from commits"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to look back (default: 7)"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output file"
    )
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Path to repository (default: current directory)"
    )
    
    args = parser.parse_args()
    
    # Get commits
    commits = get_commits(args.days, args.repo_path)
    
    if not commits:
        print("No commits found in the specified period")
        sys.exit(0)
    
    # Generate entry
    entry = generate_changelog_entry(commits, args.days)
    
    # Write output
    try:
        with open(args.output, 'w') as f:
            f.write(entry)
        print(f"Changelog entry written to {args.output}")
    except Exception as e:
        print(f"Error writing output: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
