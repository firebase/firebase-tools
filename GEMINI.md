# GEMINI.md

This file provides guidance to Gemini CLI or other coding agents when working with code in this repository. It focuses on key conventions and best practices. For a comprehensive guide on the development setup and contribution process, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Essential Commands

```bash
# Build the project
npm run build

# Link the package - once this is run, you can manually test changes in your terminal
npm link

npm test                         # Full test suite with linting and compilation
npm run mocha:fast               # Quick unit tests only
npx mocha {testfile}             # Quick unit test for a specific file

# Linting and formatting
npm run lint                     # Check all code
npm run lint:changed-files       # Lint changed files only (much faster)
npm run format                   # Auto-fix formatting issues
```

## Best Practices

### Code Quality & Utilities

- **Look for existing utilities first:** Before writing common helper functions (e.g., for logging, file system operations, promises, string manipulation), check `src/utils.ts` to see if a suitable function already exists.
- **Use the central `logger`** (`src/logger.ts`); never use `console.log()` for user-facing output.
- **Throw `FirebaseError`** (`src/error.ts`) for expected, user-facing errors. If the error is due to a violation of a precondition (e.g. something
  that is null but should never be), specify a non-zero exit code.
- **API calls must use `apiv2.ts`** for authenticated requests.
- **Reduce nesting as much as possible** Code should avoid unnecessarily deep nesting or long periods of nesting. Handle edge cases early and exit
  or fold them into the general case. Consider helper functions that can completely encapsulate branching, e.g. multiple ways a variable can be populated.

### TypeScript

- **Never use `any` or `unknown` as an escape hatch.** Define proper interfaces/types or use type guards.
- Use strict null checks and handle `undefined`/`null` explicitly.

### Testing

- **Avoid excessive mocking in unit tests.** If a test requires many mocks, it might be better as an integration test in `/scripts/[feature]-tests/`.
- **Unit tests (`*.spec.ts`) should be co-located with their source files.**
- Test error cases and edge conditions, not just the "happy path."

## Git Workflow & Pull Requests

1.  **Lint and Test Before Committing:** Run `npm run lint:changed-files` for a quick check, and run the full `npm test` before submitting your PR to catch any issues.
2.  **Structure Commit Messages for Pull Requests:** To streamline PR creation, format your commit messages to serve as both the commit and the PR description:
    - **Subject Line:** A concise, imperative summary (e.g., `feat: add frobnicator support`). This will become the PR title.
    - **Body:** After a blank line, structure the commit body to match the PR template. This will pre-populate the PR description. Include:
      - `### Description`
      - `### Scenarios Tested`
      - `### Sample Commands`
      - Reference issues with "Fixes #123" in the description.
3.  **Update Changelog:** For any user-facing change (new features, bug fixes, deprecations), add a corresponding entry to `CHANGELOG.md`.

## Agent Directives

- **Escaping Backticks:** When providing a string to a tool parameter (e.g., `new_string` in the `replace` tool) that will be part of a larger script or configuration file, single backticks (\`) used for markdown-style code formatting **must** be escaped with a backslash. For example, to render `my_code`, the string provided to the tool must be written as `\`my_code\``.
