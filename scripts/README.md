# Documentation Automation Scripts

This directory contains scripts for automating documentation updates based on code changes.

## Overview

The documentation automation system analyzes git commits and file changes to:
- Identify new features and breaking changes
- Detect documentation gaps
- Generate documentation update suggestions
- Update CHANGELOG.md automatically
- Create pull requests with documentation improvements

## Scripts

### analyze_changes.py

Analyzes code changes over a specified time period.

**Usage:**
```bash
python scripts/analyze_changes.py --days 7 --output-format json > changes.json
```

**Options:**
- `--days N` - Number of days to look back (default: 7)
- `--output-format` - Output format: `json` or `text` (default: json)
- `--repo-path PATH` - Path to git repository (default: current directory)

**Output:**
```json
{
  "period": {"days": 7, "since": "2025-10-29", "until": "2025-11-05"},
  "commits": 3,
  "files": {"total": 849, "top_changed": [...]},
  "features": [...],
  "breaking_changes": [...],
  "documentation_gaps": [...],
  "recommendations": [...]
}
```

### generate_doc_updates.py

Generates documentation updates from change analysis.

**Usage:**
```bash
python scripts/generate_doc_updates.py \
  --input changes.json \
  --output updates.md
```

**Options:**
- `--input FILE` - Input JSON file from analyze_changes.py (required)
- `--output FILE` - Output markdown file (required)

**Output:**
A markdown file with:
- Executive summary
- New features to document
- Breaking changes requiring documentation
- Documentation gaps
- File change statistics
- Recommendations

### update_documentation.py

Applies documentation updates to repository files.

**Usage:**
```bash
python scripts/update_documentation.py \
  --changes changes.json \
  --updates updates.md \
  --repo-path .
```

**Options:**
- `--changes FILE` - Changes JSON file (required)
- `--updates FILE` - Updates markdown file (required)
- `--repo-path PATH` - Repository path (default: current directory)

**Actions:**
- Updates CHANGELOG.md with recent changes
- Updates README.md with new features
- Creates documentation templates for new modules
- Updates documentation index timestamp

### format_changes_summary.py

Formats change summary for GitHub issues and PRs.

**Usage:**
```bash
python scripts/format_changes_summary.py --input changes.json
```

**Options:**
- `--input FILE` - Input JSON file from analyze_changes.py (required)

**Output:**
Formatted text summary suitable for GitHub comments and PR descriptions.

### generate_changelog.py

Generates changelog entries from git commits.

**Usage:**
```bash
python scripts/generate_changelog.py \
  --days 7 \
  --output changelog-entry.md
```

**Options:**
- `--days N` - Number of days to look back (default: 7)
- `--output FILE` - Output file (required)
- `--repo-path PATH` - Repository path (default: current directory)

**Output:**
A changelog entry with commits categorized by type:
- Features
- Bug Fixes
- Documentation
- Refactoring
- Tests
- Other Changes

## Workflow Integration

These scripts are used by the GitHub Actions workflow `.github/workflows/weekly-docs-update.yml`.

### Automated Weekly Updates

The workflow runs every Monday at 9:00 AM UTC and:

1. Analyzes changes from the past week
2. Generates documentation update suggestions
3. Updates documentation files
4. Creates a pull request with the changes

### Manual Trigger

You can manually trigger the workflow:

1. Go to Actions tab in GitHub
2. Select "Weekly Documentation Update"
3. Click "Run workflow"
4. Configure options:
   - `days_back` - Number of days to analyze (default: 7)
   - `auto_commit` - Automatically commit changes (default: false)

## Examples

### Complete Pipeline

```bash
# 1. Analyze changes
python scripts/analyze_changes.py --days 7 > changes.json

# 2. Generate documentation updates
python scripts/generate_doc_updates.py \
  --input changes.json \
  --output updates.md

# 3. Apply updates to repository
python scripts/update_documentation.py \
  --changes changes.json \
  --updates updates.md

# 4. Generate changelog entry
python scripts/generate_changelog.py \
  --days 7 \
  --output changelog-entry.md

# 5. Review and commit changes
git add docs/ CHANGELOG.md README.md
git commit -m "docs: weekly documentation update"
```

### Custom Analysis Period

```bash
# Analyze last 30 days
python scripts/analyze_changes.py --days 30 > monthly-changes.json

# Generate updates
python scripts/generate_doc_updates.py \
  --input monthly-changes.json \
  --output monthly-updates.md
```

### Text Format Output

```bash
# Get human-readable output
python scripts/analyze_changes.py --days 7 --output-format text
```

## Dependencies

The scripts require Python 3.8+ and the following packages:
- No external dependencies (uses only standard library)
- Git must be installed and accessible

## Development

### Adding New Analysis

To add new types of analysis:

1. Add analysis method to `ChangeAnalyzer` class in `analyze_changes.py`
2. Update the output format
3. Add corresponding section generator in `generate_doc_updates.py`
4. Update the workflow if needed

### Testing Scripts Locally

```bash
# Test analysis
python scripts/analyze_changes.py --days 1 --output-format text

# Test with mock data
python scripts/analyze_changes.py --days 7 > test-changes.json
python scripts/generate_doc_updates.py \
  --input test-changes.json \
  --output test-updates.md

# Review output
cat test-updates.md
```

## Error Handling

All scripts include error handling and will:
- Print error messages to stderr
- Exit with non-zero status on failure
- Provide helpful error messages

Example error handling:
```bash
#!/bin/bash
if ! python scripts/analyze_changes.py --days 7 > changes.json; then
  echo "Failed to analyze changes"
  exit 1
fi
```

## Contributing

When modifying these scripts:

1. Maintain backward compatibility
2. Update this README
3. Test with various time periods
4. Ensure error handling is robust
5. Update the workflow if needed

## License

These scripts are part of the Hallucinate App project and are licensed under AGPL-3.0.

---

*For more information about the documentation system, see [docs/INDEX.md](../docs/INDEX.md)*
