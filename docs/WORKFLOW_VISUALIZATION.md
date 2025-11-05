# Documentation Automation Workflow

## Overview

This document visualizes how the automated documentation system works.

## Workflow Trigger

```
┌─────────────────────────────────────┐
│  GitHub Actions Workflow Trigger    │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐  │
│  │  Schedule (Cron)            │  │
│  │  Every Monday at 9:00 AM    │  │
│  └─────────────────────────────┘  │
│           │                         │
│           │                         │
│  ┌─────────────────────────────┐  │
│  │  Manual Dispatch            │  │
│  │  (workflow_dispatch)        │  │
│  └─────────────────────────────┘  │
│           │                         │
└───────────┼─────────────────────────┘
            │
            ▼
```

## Analysis Phase

```
┌──────────────────────────────────────────────┐
│  Step 1: Analyze Code Changes                │
│  (scripts/analyze_changes.py)                │
├──────────────────────────────────────────────┤
│                                              │
│  Input: Git repository (last 7 days)        │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Git Log Analysis                      │ │
│  │  • Commit messages                     │ │
│  │  • Commit authors                      │ │
│  │  • Commit dates                        │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  File Change Analysis                  │ │
│  │  • New files                           │ │
│  │  • Modified files                      │ │
│  │  • Deleted files                       │ │
│  │  • Lines added/removed                 │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Pattern Detection                     │ │
│  │  • New features (feat, add, new)       │ │
│  │  • Breaking changes (breaking, remove) │ │
│  │  • Bug fixes (fix, bug)                │ │
│  │  • Documentation updates               │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Gap Identification                    │ │
│  │  • Code without docs                   │ │
│  │  • Outdated docs                       │ │
│  │  • Missing module docs                 │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  Output: changes-report.json                │
│                                              │
└──────────────────────────────────────────────┘
            │
            ▼
```

## Generation Phase

```
┌──────────────────────────────────────────────┐
│  Step 2: Generate Documentation Updates      │
│  (scripts/generate_doc_updates.py)           │
├──────────────────────────────────────────────┤
│                                              │
│  Input: changes-report.json                  │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Executive Summary                     │ │
│  │  • Period overview                     │ │
│  │  • Statistics                          │ │
│  │  • Category breakdown                  │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Feature Documentation                 │ │
│  │  • Feature descriptions                │ │
│  │  • Required updates                    │ │
│  │  • Examples needed                     │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Breaking Change Notices               │ │
│  │  • Migration guides                    │ │
│  │  • Deprecation warnings                │ │
│  │  • API changes                         │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Gap Recommendations                   │ │
│  │  • Priority levels                     │ │
│  │  • Action items                        │ │
│  │  • File-specific suggestions           │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  Output: docs-update.md                      │
│                                              │
└──────────────────────────────────────────────┘
            │
            ▼
```

## Update Phase

```
┌──────────────────────────────────────────────┐
│  Step 3: Apply Documentation Updates         │
│  (scripts/update_documentation.py)           │
├──────────────────────────────────────────────┤
│                                              │
│  Input: changes-report.json + docs-update.md │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Update CHANGELOG.md                   │ │
│  │  • Add new entry with date             │ │
│  │  • Categorize changes                  │ │
│  │  • Insert at top                       │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Update README.md                      │ │
│  │  • Add recent updates section          │ │
│  │  • List new features                   │ │
│  │  • Update links                        │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Create Module Docs                    │ │
│  │  • Generate templates                  │ │
│  │  • Add to docs/ directory              │ │
│  │  • Include basic structure             │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Update Timestamps                     │ │
│  │  • docs/INDEX.md                       │ │
│  │  • Other auto-generated docs           │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  Output: Modified documentation files        │
│                                              │
└──────────────────────────────────────────────┘
            │
            ▼
```

## Pull Request Creation

```
┌──────────────────────────────────────────────┐
│  Step 4: Create Pull Request                 │
│  (GitHub Actions)                            │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │  Generate Summary                      │ │
│  │  • Change statistics                   │ │
│  │  • File lists                          │ │
│  │  • Update previews                     │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Create Branch                         │ │
│  │  docs/weekly-update-{run_number}       │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Commit Changes                        │ │
│  │  "docs: weekly documentation update"   │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Create PR                             │ │
│  │  • Title with date                     │ │
│  │  • Body with summary                   │ │
│  │  • Labels (documentation, automated)   │ │
│  │  • Assignee (repository owner)         │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  ┌────────────────────────────────────────┐ │
│  │  Comment on Issues                     │ │
│  │  • Find docs-related issues            │ │
│  │  • Add notification comment            │ │
│  └────────────────────────────────────────┘ │
│           │                                  │
│           ▼                                  │
│  Output: Pull Request created                │
│                                              │
└──────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                       Data Flow                              │
└─────────────────────────────────────────────────────────────┘

Git Repository
    │
    ├─> Commits (last 7 days)
    │       │
    │       └─> analyze_changes.py
    │               │
    │               └─> changes-report.json
    │                       ├─> Statistics
    │                       ├─> Features
    │                       ├─> Breaking Changes
    │                       ├─> Documentation Gaps
    │                       └─> Recommendations
    │                               │
    │                               └─> generate_doc_updates.py
    │                                       │
    │                                       └─> docs-update.md
    │                                               ├─> Executive Summary
    │                                               ├─> Feature Sections
    │                                               ├─> Breaking Changes
    │                                               └─> Recommendations
    │                                                       │
    │                                                       └─> update_documentation.py
    │                                                               │
    ├───────────────────────────────────────────────────────────────┤
    │                                                               │
    ├─> CHANGELOG.md ←─────────────────────────────────────────────┤
    │                                                               │
    ├─> README.md ←────────────────────────────────────────────────┤
    │                                                               │
    ├─> docs/INDEX.md ←────────────────────────────────────────────┤
    │                                                               │
    └─> docs/{module}.md ←────────────────────────────────────────┘
                │
                └─> Pull Request
                        ├─> Review
                        └─> Merge
```

## Workflow States

```
┌─────────────┐
│   Idle      │
└──────┬──────┘
       │ Cron trigger (Monday 9 AM)
       │ or Manual dispatch
       ▼
┌─────────────┐
│  Triggered  │
└──────┬──────┘
       │ Start jobs
       ▼
┌─────────────┐
│  Analyzing  │◄────┐
└──────┬──────┘     │
       │            │
       │ Success    │ Retry
       ▼            │
┌─────────────┐     │
│ Generating  │─────┘
└──────┬──────┘
       │ 
       │ Has changes?
       ├─ No ──> Exit
       │
       │ Yes
       ▼
┌─────────────┐
│  Updating   │
└──────┬──────┘
       │
       │ Create PR or Auto-commit?
       ├─ PR ──────┐
       │           ▼
       │     ┌─────────────┐
       │     │ PR Created  │
       │     └──────┬──────┘
       │            │
       │            │ Notify
       │            ▼
       │     ┌─────────────┐
       │     │  Awaiting   │
       │     │   Review    │
       │     └─────────────┘
       │
       └─ Auto ────┐
                   ▼
            ┌─────────────┐
            │  Committed  │
            └──────┬──────┘
                   │
                   ▼
            ┌─────────────┐
            │  Complete   │
            └─────────────┘
```

## Configuration Options

```yaml
# Workflow Inputs (Manual Trigger)
┌───────────────────────────────────┐
│  days_back: 7                     │
│  Description: Days to analyze     │
│  Default: 7                       │
│  Range: 1-90                      │
└───────────────────────────────────┘

┌───────────────────────────────────┐
│  auto_commit: false               │
│  Description: Skip PR, commit     │
│  Default: false                   │
│  Options: true/false              │
└───────────────────────────────────┘
```

## Script Dependencies

```
analyze_changes.py
    ├─> Python 3.8+
    ├─> Git (command-line)
    └─> Standard library only
        ├─> subprocess
        ├─> json
        ├─> datetime
        └─> pathlib

generate_doc_updates.py
    ├─> Python 3.8+
    └─> Standard library only
        ├─> json
        ├─> datetime
        └─> typing

update_documentation.py
    ├─> Python 3.8+
    └─> Standard library only
        ├─> json
        ├─> pathlib
        └─> datetime

format_changes_summary.py
    ├─> Python 3.8+
    └─> Standard library only
        ├─> json
        └─> sys

generate_changelog.py
    ├─> Python 3.8+
    ├─> Git (command-line)
    └─> Standard library only
        ├─> subprocess
        ├─> datetime
        └─> pathlib
```

## Output Examples

### changes-report.json
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

### docs-update.md
```markdown
# Documentation Updates
*Generated: 2025-11-05*

## Executive Summary
- 2 new features identified
- 5 documentation gaps

## 🎉 New Features
### Feature Name
- **Commit:** abc123
- **Suggested Updates:**
  - [ ] Add to README
  - [ ] Update API docs
  ...
```

### Pull Request
```
Title: 📚 Weekly Documentation Update - Week of 2025-11-05

Body:
## 📚 Weekly Documentation Updates

### Changes Analyzed
**Period:** 2025-10-29 to 2025-11-05
**Commits:** 3

### Documentation Updates
[Full update suggestions]

### Files Modified
- CHANGELOG.md
- README.md
- docs/INDEX.md

Labels: documentation, automated
Assignee: repository-owner
```

---

*This workflow runs automatically every Monday at 9:00 AM UTC*
