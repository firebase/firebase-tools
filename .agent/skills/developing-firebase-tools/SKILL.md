---
name: developing-firebase-tools
description: >-
  Develop the firebase-tools repository. Use when asked to make changes,
  fix bugs, create branches, or submit pull requests in the firebase-tools
  repository.
---

# Developing Firebase Tools

This skill guides you through setting up branches or git worktrees, managing dependencies, testing changes, and submitting PRs for the `firebase-tools` repository.

## Repository Setup & Workspace Management

When working on a feature or bug fix, you can work either in a dedicated Git branch in your current repository clone, or use Git worktrees to isolate multiple tasks or parallel changes.

- **Option A: Direct Branch (Single task)**
  ```bash
  git checkout main
  git pull origin main
  git checkout -b {branch_name}
  ```

- **Option B: Git Worktree (Recommended for isolating parallel tasks or agent workflows)**
  Create a worktree outside or sibling to the repository:
  ```bash
  git fetch origin main
  git worktree add -b {branch_name} ../firebase-tools-worktrees/{branch_name} origin/main
  cd ../firebase-tools-worktrees/{branch_name}
  ```
  *Tip:* For small changes in a new worktree, you can avoid a full `npm install` by symlinking the primary clone's dependencies:
  ```bash
  ln -sfn ../firebase-tools/node_modules node_modules
  ```

---

## Environment & Dependency Notes

- **Node.js Versions**:
  - The CLI supports Node 20+.
  - When updating dependencies or modifying `package.json`, synchronize `npm-shrinkwrap.json` using Node 24 (`nvm use 24 && npm install --package-lock-only` or `npm install --package-lock-only` under Node 24) and commit the diff to ensure the CI `check-package-lock (24)` check passes.
- **Code Formatting & Linting**:
  - The repository enforces Prettier formatting in CI. Run Prettier on changed files (including `.yaml` and `.json`) before committing/pushing:
    ```bash
    npm run format
    # or to verify without writing:
    npx prettier --check path/to/changed/files
    ```
  - Verify lint checks:
    ```bash
    npm run lint
    ```
- **ESM vs CommonJS Dependencies**:
  - The Firebase CLI compiles to CommonJS, and the standalone binary bundles Node 20.x (which lacks unflagged `require(esm)` support). CI tests both Node 20 and Node 24.
  - If a dependency is ESM-only (`"type": "module"`, no `require` export), do not import it statically at the top level of files that are loaded eagerly during CLI initialization.
  - Instead, load ESM-only dependencies lazily using dynamic `import()` (see `src/streamJson.ts` for an example using `new Function("url", "return import(url)")` to avoid `ts-node` rewriting `import()` to `require()` in Mocha tests).

---

## Workflow: Development & Verification

1. **Implement Changes**:
   Make the necessary changes following the repository's coding standards.

2. **Verify Code Compiles & Tests Pass**:
   Ensure you are in the workspace or worktree directory, then run:
   ```bash
   npm run build
   npm test
   ```
   To run a specific test file:
   ```bash
   npm test -- src/test/path/to/test.spec.ts
   ```

3. **Commit Changes**:
   ```bash
   git add .
   git commit -m "Your descriptive commit message"
   ```

---

## Workflow: Submitting a Pull Request (PR)

When you have completed your changes and verified tests and formatting:

1. **Push Branch**:
   - **For maintainers with write access**: Push directly to `origin`:
     ```bash
     git push origin {branch_name}
     ```
   - **For contributors using a fork**: Push to your fork remote:
     ```bash
     git push <fork-remote> {branch_name}
     ```

2. **Create PR using the GitHub CLI (`gh`)**:
   - **From a direct branch**:
     ```bash
     gh pr create --repo firebase/firebase-tools --head {branch_name} --base main --title "Your PR Title" --body "Your PR Description"
     ```
   - **From a fork**:
     ```bash
     gh pr create --repo firebase/firebase-tools --head <your-github-username>:{branch_name} --base main --title "Your PR Title" --body "Your PR Description"
     ```
   *Note: If the `gh pr create` command prompts for interactive input, passing arguments like `--title` and `--body` makes it non-interactive. You can also add `--draft` if the PR is a work-in-progress.*
