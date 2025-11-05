#!/usr/bin/env python3
"""
Generate documentation updates based on code change analysis.

This script takes the analysis output and generates suggested documentation
updates in markdown format.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List


class DocumentationGenerator:
    """Generates documentation updates from change analysis."""
    
    def __init__(self, analysis: Dict):
        self.analysis = analysis
        self.updates = []
    
    def generate(self) -> str:
        """Generate documentation updates."""
        output = []
        
        # Header
        output.append("# Documentation Updates")
        output.append("")
        output.append(f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}*")
        output.append("")
        output.append(f"**Analysis Period:** {self.analysis['period']['since']} to {self.analysis['period']['until']}")
        output.append(f"**Commits Analyzed:** {self.analysis['commits']}")
        output.append(f"**Files Changed:** {self.analysis['files']['total']}")
        output.append("")
        
        # Executive Summary
        output.extend(self._generate_summary())
        
        # New Features
        if self.analysis.get("features"):
            output.extend(self._generate_features_section())
        
        # Breaking Changes
        if self.analysis.get("breaking_changes"):
            output.extend(self._generate_breaking_changes_section())
        
        # Documentation Gaps
        if self.analysis.get("documentation_gaps"):
            output.extend(self._generate_gaps_section())
        
        # File Changes
        output.extend(self._generate_file_changes_section())
        
        # Recommendations
        if self.analysis.get("recommendations"):
            output.extend(self._generate_recommendations_section())
        
        return "\n".join(output)
    
    def _generate_summary(self) -> List[str]:
        """Generate executive summary."""
        output = ["## Executive Summary", ""]
        
        features_count = len(self.analysis.get("features", []))
        breaking_count = len(self.analysis.get("breaking_changes", []))
        gaps_count = len(self.analysis.get("documentation_gaps", []))
        
        if features_count > 0:
            output.append(f"- **{features_count}** new features identified that need documentation")
        
        if breaking_count > 0:
            output.append(f"- **{breaking_count}** breaking changes detected requiring migration guides")
        
        if gaps_count > 0:
            output.append(f"- **{gaps_count}** documentation gaps identified")
        
        # File category summary
        if self.analysis.get("file_categories"):
            cats = self.analysis["file_categories"]
            output.append("")
            output.append("**Changes by Category:**")
            for category, count in cats.items():
                if count > 0:
                    output.append(f"- {category.title()}: {count} files")
        
        output.append("")
        return output
    
    def _generate_features_section(self) -> List[str]:
        """Generate new features section."""
        output = ["## 🎉 New Features", ""]
        output.append("The following features were added and should be documented:")
        output.append("")
        
        for feature in self.analysis["features"][:10]:  # Top 10
            output.append(f"### {feature['message']}")
            output.append("")
            output.append(f"- **Commit:** `{feature['commit']}`")
            output.append(f"- **Date:** {feature['date']}")
            output.append("")
            output.append("**Suggested Documentation Updates:**")
            output.append("- [ ] Add feature description to README.md")
            output.append("- [ ] Update API documentation")
            output.append("- [ ] Add usage examples")
            output.append("- [ ] Update CHANGELOG.md")
            output.append("")
        
        return output
    
    def _generate_breaking_changes_section(self) -> List[str]:
        """Generate breaking changes section."""
        output = ["## ⚠️ Breaking Changes", ""]
        output.append("The following breaking changes require immediate documentation:")
        output.append("")
        
        for change in self.analysis["breaking_changes"]:
            output.append(f"### {change['message']}")
            output.append("")
            output.append(f"- **Commit:** `{change['commit']}`")
            output.append(f"- **Date:** {change['date']}")
            output.append("")
            output.append("**Required Documentation Updates:**")
            output.append("- [ ] Add migration guide section")
            output.append("- [ ] Update CHANGELOG.md with breaking change notice")
            output.append("- [ ] Update affected API documentation")
            output.append("- [ ] Add deprecation warnings if applicable")
            output.append("")
        
        return output
    
    def _generate_gaps_section(self) -> List[str]:
        """Generate documentation gaps section."""
        output = ["## 📝 Documentation Gaps", ""]
        output.append("The following areas need documentation attention:")
        output.append("")
        
        # Group by type
        gaps_by_type = {}
        for gap in self.analysis["documentation_gaps"]:
            gap_type = gap.get("type", "unknown")
            if gap_type not in gaps_by_type:
                gaps_by_type[gap_type] = []
            gaps_by_type[gap_type].append(gap)
        
        for gap_type, gaps in gaps_by_type.items():
            title = gap_type.replace("_", " ").title()
            output.append(f"### {title}")
            output.append("")
            
            for gap in gaps[:10]:  # Limit to 10 per type
                output.append(f"- **{gap['file']}**")
                output.append(f"  - {gap['suggestion']}")
            
            if len(gaps) > 10:
                output.append(f"  - *...and {len(gaps) - 10} more*")
            
            output.append("")
        
        return output
    
    def _generate_file_changes_section(self) -> List[str]:
        """Generate file changes section."""
        output = ["## 📂 File Changes", ""]
        
        # New files
        if self.analysis.get("new_files"):
            output.append("### New Files")
            output.append("")
            for filepath in self.analysis["new_files"][:20]:
                output.append(f"- `{filepath}`")
            if len(self.analysis["new_files"]) > 20:
                output.append(f"- *...and {len(self.analysis['new_files']) - 20} more*")
            output.append("")
        
        # Deleted files
        if self.analysis.get("deleted_files"):
            output.append("### Deleted Files")
            output.append("")
            for filepath in self.analysis["deleted_files"][:20]:
                output.append(f"- `{filepath}`")
            if len(self.analysis["deleted_files"]) > 20:
                output.append(f"- *...and {len(self.analysis['deleted_files']) - 20} more*")
            output.append("")
        
        # Most changed files
        if self.analysis.get("files", {}).get("top_changed"):
            output.append("### Most Modified Files")
            output.append("")
            output.append("| File | Added | Removed | Changes |")
            output.append("|------|-------|---------|---------|")
            
            for file_info in self.analysis["files"]["top_changed"][:15]:
                path = file_info["path"]
                added = file_info["added"]
                removed = file_info["removed"]
                changes = file_info["changes"]
                output.append(f"| `{path}` | +{added} | -{removed} | {changes} |")
            
            output.append("")
        
        return output
    
    def _generate_recommendations_section(self) -> List[str]:
        """Generate recommendations section."""
        output = ["## 💡 Recommendations", ""]
        output.append("Based on the analysis, here are the recommended documentation updates:")
        output.append("")
        
        # Sort by priority
        priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        sorted_recs = sorted(
            self.analysis["recommendations"],
            key=lambda x: priority_order.get(x["priority"], 4)
        )
        
        for rec in sorted_recs:
            priority_emoji = {
                "critical": "🚨",
                "high": "⚠️",
                "medium": "📌",
                "low": "💭"
            }.get(rec["priority"], "•")
            
            output.append(f"### {priority_emoji} {rec['title']} ({rec['priority'].upper()})")
            output.append("")
            output.append(f"**Description:** {rec['description']}")
            output.append("")
            output.append(f"**Action:** {rec['action']}")
            output.append("")
        
        return output


def main():
    parser = argparse.ArgumentParser(
        description="Generate documentation updates from change analysis"
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Input JSON file from analyze_changes.py"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output markdown file"
    )
    
    args = parser.parse_args()
    
    # Load analysis
    try:
        with open(args.input, 'r') as f:
            analysis = json.load(f)
    except Exception as e:
        print(f"Error loading analysis: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Generate documentation
    generator = DocumentationGenerator(analysis)
    doc_updates = generator.generate()
    
    # Write output
    try:
        with open(args.output, 'w') as f:
            f.write(doc_updates)
        print(f"Documentation updates written to {args.output}")
    except Exception as e:
        print(f"Error writing output: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
