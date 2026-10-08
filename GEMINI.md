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

- **Survey prior art & harmonize utilities:** Before writing or adding any method that could be a common, reusable helper (e.g. retries, backoff, string parsing, path containment, domain transformations):
  - **Check existing patterns first:** Search the codebase (`src/utils.ts` and relevant subsystems) to see if other code is doing a similar thing and how.
  - **Reuse or unify immediately:** Either reuse how existing code does it, or if introducing a new common utility, unify it with existing custom implementations across the codebase immediately rather than creating diverging parallel implementations.
- **Use the central `logger`** (`src/logger.ts`); never use `console.log()` for user-facing output.
- **Throw `FirebaseError`** (`src/error.ts`) for expected, user-facing errors. If the error is due to a violation of a precondition (e.g. something
  that is null but should never be), specify a non-zero exit code (`{ exit: 1 }`). Error messages should clearly explain what failed and why; when actionable, provide concrete remediation guidance (e.g. the expected format, a `--force` flag, or a discovery command like `firebase <entity>:list`).
- **Extract magic numbers and static constants:** Define static IDs, default timeouts, millisecond offsets, and repeated strings as top-level constants (`UPPER_SNAKE_CASE`) instead of inlining magic values inside functions. Mark static configuration arrays and lookup tables as `readonly` or `as const`.
- **API calls must use `apiv2.ts`** for authenticated requests.
- **Reduce nesting as much as possible:** Code should avoid unnecessarily deep nesting or long periods of nesting. Use early returns, `continue`, and `break` statements in functions and loops to handle edge cases early and keep main logic flat. Consider helper functions to encapsulate complex branching.

### Command Architecture & Lifecycle (`src/command.ts`)

- **Keep CLI commands thin:** Code in `src/commands/` should handle argument parsing, option declaration, and validation only; move business logic, multi-step orchestration, and API calls to dedicated modules in `src/` (outside of `src/commands/`).
- **Standardize command options and hooks:**
  - Use `.before()` hooks for standard prerequisite gating (e.g. `requireAuth`, `needProjectId`, `requirePermissions`) rather than manual ad-hoc checks inside command actions.
  - Use `Command.withForce()` for destructive or confirmable actions so `-f, --force` is consistently supported across commands.
- **Machine-composable output & stream discipline:**
  - `stdout`: Reserved exclusively for machine-parseable data when `--json` is enabled, or primary command output in human mode. Actions should return data so the runner can serialize it under `--json`.
  - `stderr`: Used for interactive spinners (`ora`), diagnostic logging (`logger.debug`), and warnings.
  - **Stream isolation**: Never interleave active `ora` spinners with un-buffered `logger.info` or `logLabeledBullet` calls; stop or complete spinners before printing sequential step logs.

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
