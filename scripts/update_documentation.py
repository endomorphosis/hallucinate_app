#!/usr/bin/env python3
"""
Update documentation files based on change analysis and generated updates.

This script applies the generated documentation updates to the actual
documentation files in the repository.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List


class DocumentationUpdater:
    """Updates documentation files based on analysis."""
    
    def __init__(self, repo_path: str = "."):
        self.repo_path = Path(repo_path)
        self.updates_made = []
    
    def update(self, changes: Dict, updates_content: str):
        """Apply documentation updates."""
        
        # Update CHANGELOG.md
        self._update_changelog(changes)
        
        # Update README.md with new features
        if changes.get("features"):
            self._update_readme_features(changes["features"])
        
        # Create documentation for new modules
        if changes.get("modules"):
            self._create_module_docs(changes["modules"])
        
        # Update INDEX.md
        self._update_index()
        
        return self.updates_made
    
    def _update_changelog(self, changes: Dict):
        """Update CHANGELOG.md with recent changes."""
        changelog_path = self.repo_path / "CHANGELOG.md"
        
        # Create CHANGELOG if it doesn't exist
        if not changelog_path.exists():
            with open(changelog_path, 'w') as f:
                f.write("# Changelog\n\n")
                f.write("All notable changes to this project will be documented in this file.\n\n")
        
        # Read existing content
        with open(changelog_path, 'r') as f:
            existing_content = f.read()
        
        # Generate new entry
        entry_lines = [
            f"## [{datetime.now().strftime('%Y-%m-%d')}]",
            ""
        ]
        
        # Add features
        if changes.get("features"):
            entry_lines.append("### Added")
            entry_lines.append("")
            for feature in changes["features"][:10]:
                msg = feature["message"].strip()
                entry_lines.append(f"- {msg}")
            entry_lines.append("")
        
        # Add breaking changes
        if changes.get("breaking_changes"):
            entry_lines.append("### Breaking Changes")
            entry_lines.append("")
            for change in changes["breaking_changes"]:
                msg = change["message"].strip()
                entry_lines.append(f"- {msg}")
            entry_lines.append("")
        
        # Add modified files summary
        if changes.get("files", {}).get("top_changed"):
            entry_lines.append("### Changed")
            entry_lines.append("")
            top_files = changes["files"]["top_changed"][:5]
            for file_info in top_files:
                entry_lines.append(f"- Updated `{file_info['path']}`")
            entry_lines.append("")
        
        entry_text = "\n".join(entry_lines)
        
        # Insert new entry (after header)
        lines = existing_content.split('\n')
        header_end = 0
        for i, line in enumerate(lines):
            if line.startswith("## ["):
                header_end = i
                break
            elif i > 10:  # Assume header is within first 10 lines
                header_end = i
                break
        
        if header_end == 0:
            header_end = len(lines)
        
        new_content = '\n'.join(lines[:header_end]) + '\n\n' + entry_text + '\n'.join(lines[header_end:])
        
        # Write updated content
        with open(changelog_path, 'w') as f:
            f.write(new_content)
        
        self.updates_made.append({
            "file": "CHANGELOG.md",
            "action": "updated",
            "description": "Added recent changes"
        })
    
    def _update_readme_features(self, features: List[Dict]):
        """Update README.md with new features."""
        readme_path = self.repo_path / "README.md"
        
        if not readme_path.exists():
            return
        
        with open(readme_path, 'r') as f:
            content = f.read()
        
        # Check if there's a "Recent Updates" or "What's New" section
        if "## Recent Updates" not in content and "## What's New" not in content:
            # Add a new section after the main description
            lines = content.split('\n')
            insert_pos = 0
            
            # Find a good insertion point (after first few sections)
            for i, line in enumerate(lines):
                if line.startswith("## ") and i > 5:
                    insert_pos = i
                    break
            
            if insert_pos > 0:
                new_section = [
                    "",
                    "## Recent Updates",
                    "",
                    f"*Last updated: {datetime.now().strftime('%Y-%m-%d')}*",
                    ""
                ]
                
                for feature in features[:3]:  # Top 3 features
                    msg = feature["message"].strip()
                    new_section.append(f"- {msg}")
                
                new_section.append("")
                
                lines = lines[:insert_pos] + new_section + lines[insert_pos:]
                
                with open(readme_path, 'w') as f:
                    f.write('\n'.join(lines))
                
                self.updates_made.append({
                    "file": "README.md",
                    "action": "updated",
                    "description": "Added recent updates section"
                })
    
    def _create_module_docs(self, modules: List[str]):
        """Create documentation for modules that don't have it."""
        docs_path = self.repo_path / "docs"
        docs_path.mkdir(exist_ok=True)
        
        for module in modules:
            doc_file = docs_path / f"{module.upper()}.md"
            
            # Skip if doc already exists
            if doc_file.exists():
                continue
            
            # Create basic documentation template
            template = f"""# {module.title()} Module

## Overview

Documentation for the `{module}` module.

## Installation

```bash
# Installation instructions
```

## Usage

```javascript
// Usage examples
```

## API Reference

### Classes

### Functions

### Configuration

## Examples

## Testing

## Troubleshooting

---

*This documentation was auto-generated and should be completed manually.*
"""
            
            with open(doc_file, 'w') as f:
                f.write(template)
            
            self.updates_made.append({
                "file": str(doc_file),
                "action": "created",
                "description": f"Created documentation template for {module}"
            })
    
    def _update_index(self):
        """Update docs/INDEX.md with timestamp."""
        index_path = self.repo_path / "docs" / "INDEX.md"
        
        if not index_path.exists():
            return
        
        with open(index_path, 'r') as f:
            content = f.read()
        
        # Update the auto-update timestamp
        if "*This documentation is automatically updated" in content:
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if "This documentation is automatically updated" in line:
                    lines[i] = f"*This documentation is automatically updated weekly via GitHub Actions. Last update: {datetime.now().strftime('%Y-%m-%d')}*"
                    break
            
            with open(index_path, 'w') as f:
                f.write('\n'.join(lines))
            
            self.updates_made.append({
                "file": "docs/INDEX.md",
                "action": "updated",
                "description": "Updated timestamp"
            })


def main():
    parser = argparse.ArgumentParser(
        description="Update documentation files based on analysis"
    )
    parser.add_argument(
        "--changes",
        required=True,
        help="Changes JSON file from analyze_changes.py"
    )
    parser.add_argument(
        "--updates",
        required=True,
        help="Updates markdown file from generate_doc_updates.py"
    )
    parser.add_argument(
        "--repo-path",
        default=".",
        help="Path to repository (default: current directory)"
    )
    
    args = parser.parse_args()
    
    # Load changes
    try:
        with open(args.changes, 'r') as f:
            changes = json.load(f)
    except Exception as e:
        print(f"Error loading changes: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Load updates
    try:
        with open(args.updates, 'r') as f:
            updates_content = f.read()
    except Exception as e:
        print(f"Error loading updates: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Apply updates
    updater = DocumentationUpdater(args.repo_path)
    results = updater.update(changes, updates_content)
    
    # Print summary
    print(f"Documentation updates completed:")
    for result in results:
        print(f"  [{result['action'].upper()}] {result['file']}: {result['description']}")
    
    print(f"\nTotal files modified: {len(results)}")


if __name__ == "__main__":
    main()
