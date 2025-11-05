#!/usr/bin/env python3
"""
Format the changes summary for GitHub issues and pull requests.
"""

import argparse
import json
import sys


def format_summary(changes: dict) -> str:
    """Format changes into a readable summary."""
    output = []
    
    # Period
    output.append(f"**Period:** {changes['period']['since']} to {changes['period']['until']}")
    output.append(f"**Commits:** {changes['commits']}")
    output.append("")
    
    # File statistics
    if changes.get("file_categories"):
        output.append("**Changes by Type:**")
        for category, count in changes["file_categories"].items():
            if count > 0:
                output.append(f"- {category.title()}: {count} files")
        output.append("")
    
    # Top changed files
    if changes.get("files", {}).get("top_changed"):
        output.append("**Most Active Files:**")
        for file_info in changes["files"]["top_changed"][:5]:
            path = file_info["path"]
            total = file_info["added"] + file_info["removed"]
            output.append(f"- `{path}` ({total} lines changed)")
        output.append("")
    
    # Features
    if changes.get("features"):
        output.append(f"**New Features:** {len(changes['features'])}")
        for feature in changes["features"][:3]:
            output.append(f"- {feature['message']}")
        if len(changes["features"]) > 3:
            output.append(f"- *...and {len(changes['features']) - 3} more*")
        output.append("")
    
    # Breaking changes
    if changes.get("breaking_changes"):
        output.append(f"**Breaking Changes:** {len(changes['breaking_changes'])}")
        for change in changes["breaking_changes"]:
            output.append(f"- ⚠️ {change['message']}")
        output.append("")
    
    # Documentation gaps
    if changes.get("documentation_gaps"):
        output.append(f"**Documentation Needs Attention:** {len(changes['documentation_gaps'])} areas")
        output.append("")
    
    return "\n".join(output)


def main():
    parser = argparse.ArgumentParser(
        description="Format changes summary for display"
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Input JSON file from analyze_changes.py"
    )
    
    args = parser.parse_args()
    
    try:
        with open(args.input, 'r') as f:
            changes = json.load(f)
        
        summary = format_summary(changes)
        print(summary)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
