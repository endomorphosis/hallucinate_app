# How to View Menu Screenshots in GitHub PRs

## Quick Steps

1. Go to the PR page on GitHub
2. Click **"Checks"** tab at the top
3. Find **"MCP Daemon Manager E2E Tests"** in the left sidebar
4. Scroll to the bottom to **"Artifacts"** section
5. Download `screenshots-{platform}-node-{version}.zip`

## What You'll Find

Each platform generates 11 screenshots showing:

- Initial app window
- Home navigation (⌘H)
- Main Dashboard (⌘D)
- IPFS Kit Dashboard (⌘⌥1)
- IPFS Datasets Dashboard (⌘⌥2)
- IPFS Accelerate Dashboard (⌘⌥3)
- SwissKnife Dashboard (⌘⌥4)
- MCP Control Panel (⌘M)
- Back navigation (Alt+←)
- Forward navigation (Alt+→)
- Final state

## Visual Guide

```
GitHub PR Page
    ↓
Click "Checks" Tab
    ↓
Select "MCP Daemon Manager E2E Tests"
    ↓
Scroll to Bottom
    ↓
Click "Artifacts" Section
    ↓
Download Screenshot ZIP files
```

## Platforms Available

- **Ubuntu** (Linux desktop appearance)
- **macOS** (Mac native appearance)
- **Windows** (Windows desktop appearance)

Each with Node.js 18.x and 20.x variants.

## Run Tests Locally

```bash
# Run menu visual tests
npm run test:e2e:menu

# Screenshots saved to:
test-results/screenshots/menu-*.png
```

## More Info

See `MENU_TESTS.md` for complete documentation.
