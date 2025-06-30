# GEMINI.md

This file provides guidance to Gemini CLI or other coding agents when working with code in this repository.

## Essential Commands

```bash
# Build the project
npm run build

npm test                         # Full test suite with linting and compilation
npm run mocha:fast               # Quick unit tests only
npx npx mocha {testfile}         # quick unit test specific file only

# Linting and formatting
npm run lint                     # Check all code
npm run lint:changed-files       # Lint changed files only
npm run format                   # Auto-fix formatting issues

# TypeScript compilation
npm run test:compile             # Check TypeScript compilation
```

## Architecture Overview

### Command Structure

- Commands are defined in `src/commands/` with pattern `[service]-[action].ts`
- Each command extends base `Command` class from `src/command.ts`
- Commands are registered in `src/commands/index.ts`

### Key Patterns

- API calls use `src/apiv2.ts` for authenticated requests
- Error handling uses custom `FirebaseError` class

## Testing Guidelines

- Unit tests: `*.spec.ts` files alongside source
- Integration tests: in `/scripts/`
- Use Mocha + Chai for assertions
- Mock external services with nock

## Best Practices

### TypeScript

- **Never use `any` or `unknown`** to resolve type issues
  - Define proper interfaces/types instead
  - Use type guards for runtime type checking

### Testing

- **Avoid excessive mocking** in unit tests
  - If a test requires many mocks, consider writing an integration test instead
  - Prefer testing real behavior over implementation details
- Test error cases and edge conditions, not just happy paths
- Use descriptive test names that explain the scenario
- Group related tests with `describe` blocks
- Each test should be independent - no shared state between tests

### Code Quality

- Functions should do one thing well
- Use early returns to reduce nesting
- Extract magic numbers/strings to named constants
- Add JSDoc comments for public APIs
- Keep files focused - if a file grows too large, split it

## Git Workflow

- Never commit without running `npm run lint`
- Fix lint/type errors before pushing
- Keep commits focused on single changes
- Reference issues with "Fixes #123" in commit messages

