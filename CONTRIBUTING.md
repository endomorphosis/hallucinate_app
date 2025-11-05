# Contributing to Hallucinate App

Thank you for your interest in contributing to Hallucinate App! This guide will help you get started with contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Review Process](#review-process)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to ensure a welcoming environment for all contributors.

## Getting Started

### Prerequisites

- Node.js 18.x or 20.x
- Python 3.8+
- Git
- Yarn package manager
- IPFS daemon (optional for development)

### First Time Setup

1. **Fork the repository** on GitHub

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/hallucinate_app.git
   cd hallucinate_app
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/endomorphosis/hallucinate_app.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   # Or with Make
   make install-all-deps
   ```

5. **Initialize submodules**:
   ```bash
   git submodule update --init --recursive
   ```

## Development Setup

### Environment Configuration

1. **Copy configuration templates**:
   ```bash
   cp config/config\ template.toml config/config.toml
   ```

2. **Set environment variables** (optional):
   ```bash
   export AUTO_START_DAEMONS=false  # Don't auto-start MCP daemons
   export NODE_ENV=development
   ```

### Running the Application

```bash
# Start in development mode
npm start

# Or with electron-forge
npm run start
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:menu          # Menu system tests
npm run test:bridge        # Python bridge tests
npm run test:e2e          # End-to-end tests
npm run test:daemon-manager # Daemon manager tests

# Run with UI for debugging
npm run test:e2e:ui
```

## Project Structure

```
hallucinate_app/
├── index.js                 # Electron main process
├── preload.js              # Preload script
├── package.json            # Node.js dependencies
├── forge.config.cjs        # Electron Forge configuration
├── docs/                   # Documentation
├── hallucinate_app/        # Application source
│   ├── node/              # Node.js modules
│   ├── python/            # Python modules
│   ├── assets/            # Static assets
│   └── css/               # Stylesheets
├── test/                   # Test files
│   ├── e2e/               # End-to-end tests
│   ├── integration/       # Integration tests
│   ├── js/                # JavaScript tests
│   └── python/            # Python tests
├── scripts/               # Build and utility scripts
└── config/                # Configuration files
```

## Development Workflow

### Creating a New Feature

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Test your changes**:
   ```bash
   npm test
   npm run test:e2e
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** on GitHub

### Syncing with Upstream

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

## Coding Standards

### JavaScript

- **ES Modules**: Use `import`/`export` syntax
- **File naming**: Use `snake_case` for files
- **Indentation**: 2 spaces
- **Semicolons**: Use them
- **Quotes**: Single quotes for strings
- **Async/Await**: Prefer over callbacks

**Example**:
```javascript
import { SomeModule } from './some_module.js';

class MyClass {
  constructor(resources, metadata) {
    this.resources = resources;
    this.metadata = metadata;
  }
  
  async init() {
    // Initialize
  }
  
  async test() {
    // Test method
    return { success: true };
  }
}

export default MyClass;
```

### Python

- **Style**: Follow PEP 8
- **Type hints**: Use them where appropriate
- **Imports**: Group standard library, external, local
- **Classes**: PascalCase
- **Functions/Variables**: snake_case
- **Async**: Use asyncio for I/O operations

**Example**:
```python
from typing import Dict, Any
import asyncio

class MyModule:
    def __init__(self, resources: Dict[str, Any] = None, metadata: Dict[str, Any] = None):
        self.resources = resources or {}
        self.metadata = metadata or {}
    
    async def init(self) -> bool:
        """Initialize the module."""
        return True
    
    async def test(self) -> Dict[str, Any]:
        """Test the module."""
        return {"success": True}
```

### Module Pattern

All modules should follow the standard pattern:

1. **Constructor**: Accept `resources` and `metadata` parameters
2. **Init method**: Async initialization
3. **Test method**: Self-validation
4. **Error handling**: Use try/catch with specific errors
5. **Resource pool**: Access shared services through `resources`

### Integration Layer Pattern

When integrating external packages:

```javascript
// DON'T: Implement features directly
class MyFeature {
  constructor() {
    // Direct implementation
  }
}

// DO: Create integration layer
import ExternalPackage from 'external-package';

class MyFeatureIntegration {
  constructor(resources, metadata) {
    this.external = new ExternalPackage();
    this.resources = resources;
  }
  
  async operation() {
    // Forward to external implementation
    return await this.external.operation();
  }
}
```

## Testing

### Test Structure

Tests should be located in the appropriate directory:
- `test/js/` - JavaScript unit/integration tests
- `test/python/` - Python unit/integration tests
- `test/e2e/` - End-to-end Playwright tests
- `test/integration/` - Cross-component integration tests

### Writing Tests

**JavaScript (Mocha/Chai)**:
```javascript
import { expect } from 'chai';
import MyModule from '../hallucinate_app/node/my_module.js';

describe('MyModule', () => {
  let module;
  
  beforeEach(() => {
    module = new MyModule({}, {});
  });
  
  it('should initialize successfully', async () => {
    const result = await module.init();
    expect(result).to.be.true;
  });
  
  it('should pass self-test', async () => {
    const result = await module.test();
    expect(result.success).to.be.true;
  });
});
```

**Python (pytest)**:
```python
import pytest
from hallucinate_app.my_module import MyModule

@pytest.fixture
def module():
    return MyModule({}, {})

def test_init(module):
    result = await module.init()
    assert result is True

def test_self_test(module):
    result = await module.test()
    assert result["success"] is True
```

**Playwright (E2E)**:
```typescript
import { test, expect } from '@playwright/test';

test('should launch application', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Hallucinate App/);
});
```

### Running Specific Tests

```bash
# JavaScript tests for specific module
npx mocha test/js/test_my_module.js

# Python tests for specific module
pytest test/python/test_my_module.py

# E2E tests for specific feature
npx playwright test menu-system.spec.ts
```

## Documentation

### Documentation Standards

1. **Code comments**: Use them sparingly, prefer self-documenting code
2. **JSDoc/Docstrings**: Document public APIs
3. **README files**: Add README.md to new modules
4. **Inline examples**: Include usage examples
5. **Update docs**: Keep documentation in sync with code

### Documentation Structure

- `docs/` - Main documentation directory
- `docs/INDEX.md` - Documentation index
- Module-specific READMEs in module directories
- API documentation in `docs/API.md`

### Writing Documentation

Use clear, concise language with examples:

```markdown
# Module Name

## Overview

Brief description of what the module does.

## Installation

\```bash
npm install module-name
\```

## Usage

\```javascript
import Module from 'module-name';

const module = new Module();
await module.init();
\```

## API

### `constructor(resources, metadata)`

Description of constructor.

**Parameters:**
- `resources` (Object): Shared resource pool
- `metadata` (Object): Configuration metadata

### `async init()`

Initialize the module.

**Returns:** Promise<boolean>
```

## Submitting Changes

### Commit Message Format

Follow conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(auth): add UCAN token verification

Implement UCAN token verification in the authentication module.
Adds capability checking for all protected operations.

Closes #123
```

### Pull Request Process

1. **Ensure all tests pass**:
   ```bash
   npm test
   npm run test:e2e
   ```

2. **Update documentation** if needed

3. **Rebase on latest main** (if needed):
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

4. **Create pull request** with:
   - Clear title describing the change
   - Description of what changed and why
   - Link to related issues
   - Screenshots for UI changes

5. **Request review** from maintainers

### Pull Request Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] All tests pass
- [ ] Added new tests
- [ ] Manual testing completed

## Screenshots (if applicable)

Add screenshots for UI changes.

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added where needed
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
- [ ] All tests pass
```

## Review Process

### What to Expect

1. **Initial review**: Within 2-3 days
2. **Feedback**: Constructive comments and suggestions
3. **Iterations**: May require changes
4. **Approval**: Requires approval from maintainer
5. **Merge**: Merged after approval

### Review Criteria

- Code quality and style
- Test coverage
- Documentation completeness
- Performance impact
- Security considerations
- Backward compatibility

### Responding to Feedback

- Be responsive to review comments
- Ask questions if unclear
- Make requested changes promptly
- Re-request review after changes

## Getting Help

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Pull Requests**: Code review and collaboration

### Asking Questions

When asking for help:
1. Search existing issues first
2. Provide context and details
3. Include error messages and logs
4. Share minimal reproduction steps
5. Be patient and respectful

## Additional Resources

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Quick Start Guide](docs/QUICK_START.md)
- [API Documentation](docs/API.md)
- [Testing Guide](hallucinate_app/python/hallucinate_app/test/README_TESTING.md)

## License

By contributing to Hallucinate App, you agree that your contributions will be licensed under the AGPL-3.0 License.

---

Thank you for contributing to Hallucinate App! 🎉
