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
  that is null but should never be), specify a non-zero exit code. Error messages should clearly explain what failed and why; when actionable, provide concrete remediation guidance (e.g. suggesting `--force` or a prerequisite command).
- **Extract magic numbers and static constants:** Define static IDs, default timeouts, millisecond offsets, and repeated strings as top-level constants (`UPPER_SNAKE_CASE`) instead of inlining magic values inside functions.
- **API calls must use `apiv2.ts`** for authenticated requests.
- **Reduce nesting as much as possible:** Code should avoid unnecessarily deep nesting or long periods of nesting. Use early returns, `continue`, and `break` statements in functions and loops to handle edge cases early and keep main logic flat. Consider helper functions to encapsulate complex branching.
- **Keep CLI commands thin:** Code in `src/commands/` should handle argument parsing and validation only; move business logic and API calls to dedicated modules in `src/` (outside of `src/commands/`).
- **Machine-composable output:** When `--json` is enabled, route all human-readable logging, spinners, and warnings to `stderr` so `stdout` remains parseable JSON.

### TypeScript

- **Never use `any` or `unknown` as an escape hatch.** Define proper interfaces/types or use type guards.
- **Use union type literals over `enum`:** Never use TypeScript `enum`. Use union literals (e.g., `type Platform = "web" | "ios" | "android"`).
- **Prefer `for..of` over `.forEach`:** Use `for..of` loops when iterating, especially for asynchronous operations or where early returns are needed.
- **Prefer options objects:** Functions accepting more than three arguments should accept a single options object (`{ project, force }`).
- **Standardize on `undefined` over `null`:** Avoid `null` returns in new functions and omit redundant `= undefined` initializers. Use plain object maps (`Record<string, T>`) or arrays instead of `Map` or `Set` in public interface contracts.
- Use strict null checks and handle `undefined`/`null` explicitly.
- **Prefer falsy checks over explicit boolean comparisons:** Use `!something` instead of `something === false` unless you explicitly need to distinguish between `false` and other falsy values like `undefined` or `null`.

### Testing

- **Avoid excessive mocking in unit tests.** If a test requires many mocks, it might be better as an integration test in `/scripts/[feature]-tests/`.
- **Clean up mocks in `afterEach`:** Always restore stubs and clean intercepts in `afterEach` (`sinon.restore()`, `nock.cleanAll()`), never in suite-level `after()`. Mock verifications and assertions (e.g. `expect(nock.isDone()).to.be.true`) belong in individual tests or suite-level `afterEach()`, never in suite-level `after()` where global cleanup hooks have already cleared active mocks.
- **Test public interfaces:** Exercise public entry points and exported module functions rather than testing or stubbing private internal helpers.
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
