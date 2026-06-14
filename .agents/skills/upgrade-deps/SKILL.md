---
name: upgrade-deps
description: Process Renovate dependency PRs in batch. Analyzes changelogs, verifies codebase compatibility, applies updates, and runs per-ecosystem verification. Leaves changes uncommitted for review. Use when the user mentions Renovate, dependency PRs, dependency updates, version bumps, or asks to upgrade/update/bump packages — even if they just say "handle the bot PRs".
allowed-tools:
  - WebFetch
  - Bash(gh auth:*)
  - Bash(gh pr:*)
  - Bash(gh api:*)
  - Bash(gh repo:*)
  - Bash(git checkout:*)
  - Bash(git restore:*)
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(go mod:*)
  - Bash(go build:*)
  - Bash(go test:*)
  - Bash(helm dependency:*)
  - Bash(helm template:*)
  - Bash(actionlint:*)
  - Bash(npm install)
  - Bash(npm run:*)
  - Bash(npm test)
  - Bash(uv lock:*)
  - Bash(uv sync:*)
  - Bash(uv pip:*)
  - Bash(uv run:*)
  - Bash(rm uv.lock)
  - Bash(uvx ruff:*)
  - Bash(terraform fmt:*)
  - Bash(terraform validate)
  - Bash(terraform init:*)
  - Bash(helm show:*)
  - Edit
argument-hint: "[--category <nodejs|python|golang|terraform|kubernetes|docker|ci|tools>] [--dry-run]"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: |
            if ! command -v gh > /dev/null 2>&1; then
              echo '{"decision": "block", "reason": "GitHub CLI (gh) is not installed. Install from: https://cli.github.com/"}'
              exit 0
            fi
            if ! gh auth status > /dev/null 2>&1; then
              echo '{"decision": "block", "reason": "GitHub CLI is not authenticated. Run: gh auth login"}'
              exit 0
            fi
            exit 0
          once: true
---

# Dependency Upgrade Skill

Process Renovate dependency PRs in batch. Analyzes changelogs, verifies codebase compatibility, applies updates, and runs verification. All changes are left uncommitted for review.

## Usage

- `/upgrade-deps` - Fetch all Renovate PRs, ask which categories to upgrade
- `/upgrade-deps --category nodejs` - Only process Node.js dependencies
- `/upgrade-deps --dry-run` - Show what would be upgraded without making changes

## Process

### 1. Check Prerequisites

```bash
gh auth status
git status --porcelain  # Warn if uncommitted changes exist
```

**Detect supply chain safety windows:**

Package managers can enforce a quarantine period for newly published packages — a supply chain safety measure that delays adoption until packages have been available for a minimum number of days. This protects against compromised releases.

Check for active safety windows:

- **Python/uv**: Read `~/.config/uv/uv.toml` (user-level) and project-level `uv.toml` for `exclude-newer` setting (e.g., `exclude-newer = "7 days"`)
- **Node.js/npm** (v11+): Check `~/.npmrc` or project-level `.npmrc` for `min-release-age` setting (value in days, e.g., `min-release-age=7`)
- **Other ecosystems** (Go, Terraform, Helm): No built-in age quarantine exists. For these, rely on Renovate's merge confidence scores and changelog review.
- **General**: Check CLAUDE.md for any documented safety policies

Record the safety window duration per ecosystem — this affects release date filtering in Step 3 and lock file handling in Step 6. If no safety window is detected for an ecosystem, skip release date filtering for that ecosystem.

**Recommended practice:** If no safety window is configured, suggest the user set one up:
- **Python/uv**: Add `exclude-newer = "7 days"` to `~/.config/uv/uv.toml`
- **Node.js/npm** (v11+): Add `min-release-age=7` to `~/.npmrc`

This prevents installing packages published less than 7 days ago — giving time for the community to discover compromised releases.

### 2. Fetch Renovate PRs

```bash
gh pr list --label dependencies --author app/renovate --state open \
  --json number,title,labels,body,url
```

Parse each PR to extract package name(s), version changes, and category label.

### 3. Group and Filter PRs

| Label        | Ecosystem      | Version File                        |
| ------------ | -------------- | ----------------------------------- |
| `nodejs`     | npm packages   | `package.json`                      |
| `python`     | Python/uv      | `pyproject.toml`                    |
| `golang`     | Go modules     | `go.mod`                            |
| `terraform`  | TF providers   | `*.tf`, `.terraform-version`        |
| `kubernetes` | Helm charts    | `Chart.yaml`, `chart-versions.yaml` |
| `docker`     | Docker images  | `Dockerfile` FROM tags              |
| `ci`         | GitHub Actions | `.github/workflows/*.yml`           |
| (unlabeled)  | Tool versions  | `.tool-versions`, `mise.toml`       |

**PRs without ecosystem labels:** If a PR only has the `dependencies` label, infer the ecosystem from the PR title or body (e.g., "update module github.com/..." → Go, "update dependency deno" → tools).

**Ordering:** CRD charts before main charts. Oldest PRs first within category.

**Safety window filtering** (only when a safety window was detected in Step 1):

For each PR, determine the target version's release date:

1. Check the Renovate PR body — it often includes the release/publish date
2. For GitHub-hosted packages: `gh api repos/{owner}/{repo}/releases/tags/v{version}` → check `published_at`
3. If the date cannot be determined, treat the package as eligible (do not block on missing data)

Compare each release date against the safety window cutoff (today minus the window duration). Packages whose target version was published within the safety window are **deferred** — they are not skipped permanently but will become eligible once the quarantine period passes. Check ALL packages upfront before applying any changes to avoid iterative failures during lock file resolution.

**Auto-skip patterns** (glob-style matching):

| Pattern                                  | Reason                                         |
| ---------------------------------------- | ---------------------------------------------- |
| `apache/beam_python*_sdk`, `apache-beam` | Coordinated Dockerfile + pyproject.toml update |
| Python/Node.js major runtime version     | Cloud support must be verified                 |
| `@elastic/elasticsearch` v9              | Blocked until Elastic migration complete       |
| Repo-specific blocked packages           | Check CLAUDE.md for current blocklist          |

### 4. Present Selection

Use AskUserQuestion with multiSelect, showing PR counts and package names per category. List auto-skipped PRs separately. If any packages were deferred due to the safety window, list them separately with their release date and expected eligibility date.

### 5. Analyze Each Package

This is the highest-risk step. A false positive (marking a breaking change as safe) causes production incidents. A false negative (marking a safe change as UNVERIFIED) costs the user 30 seconds of review. Always err toward UNVERIFIED.

**5.1 Read the Renovate PR body first.**

Renovate already fetches and embeds release notes from GitHub/GitLab into the PR description. For each PR, read the `body` field from the data fetched in Step 2. This is your primary changelog source — it covers the exact version range being upgraded.

If the PR body contains release notes with sufficient detail (breaking changes section, migration notes, or clear "no breaking changes" statement), you can use it as your changelog source for that package.

**5.2 For packages where the PR body lacks release notes, fetch externally:**

| Ecosystem      | Primary Source                                     | Fallback                 |
| -------------- | -------------------------------------------------- | ------------------------ |
| npm            | GitHub releases page (from `repository.url` field) | npmjs.com package page   |
| Python         | GitHub releases page (from PyPI `project_urls`)    | PyPI release history     |
| Terraform      | Provider's GitHub releases page                    | Terraform Registry docs  |
| Helm           | `helm show chart` + app changelog                  | ArtifactHub              |
| Docker         | Source repo's GitHub releases                      | Docker Hub description   |
| GitHub Actions | Action repo's releases page                        | Action repo CHANGELOG.md |

Use WebFetch on the changelog URL. If inaccessible, try the fallback. If both fail, flag the package as **UNVERIFIED** — do not assume safety.

**5.3 Read ALL release notes between current and target versions.**

- For patch/minor: read the release notes for each intermediate version
- For major versions: read every intermediate release AND migration guides if available
- For multi-major jumps (e.g., v2 → v5): upgrade sequentially through each major version, not directly to the target
- Look for: `BREAKING`, `breaking change`, `migration`, `deprecated`, `removed`, `renamed`, `dropped`
- Note the specific affected APIs, methods, config fields, CLI flags, or behaviors

**5.4 Search the codebase to understand how each package is used.**

For every package (not just those with breaking changes):

```
Grep for: "import <package>" and "from <package>"
Grep for: "require('<package>')" and "<package>/" in import paths
```

For packages with identified breaking changes, also search for the specific affected APIs:

```
Grep for: affected method names, class names, config keys, CLI flags
```

Cross-reference usage against the breaking changes from 5.3. A package with zero imports in the codebase is safe regardless of breaking changes. A package used in 20 files with a renamed method is unsafe.

**5.5 Record evidence for each package.**

For each package, you must be able to answer all of these:

1. Where did you read the changelog? (PR body / GitHub releases URL / PyPI / other)
2. What breaking changes exist? (quote specific text, or "none found in changelog")
3. How is the package used in our codebase? (list files, or "zero imports found")
4. Why is the verdict what it is? (connect evidence from 1-3)

If you cannot answer all four, the verdict is UNVERIFIED.

**5.6 Present findings and decide whether to proceed.**

Show a summary table with evidence for ALL packages:

```
| Package | Version | Breaking Changes | Our Usage | Verdict |
|---|---|---|---|---|
| sqlalchemy | 2.0.45 → 2.0.46 | None (patch release, changelog confirms bugfixes only) | 15 files in src/database/ | SAFE |
| gunicorn | 23.0 → 25.0 | Eventlet/gevent worker deprecation (v24 changelog) | api.py, webhook.py — uses default sync worker | SAFE |
| some-lib | 1.0 → 2.0 | Changelog inaccessible (403 on GitHub, PyPI has no notes) | 3 files | UNVERIFIED |
```

**If ALL packages are SAFE:** proceed with applying changes immediately — no need to block for confirmation.

**If any package is UNSAFE or UNVERIFIED:** explain why and use AskUserQuestion to ask the user how to proceed (apply anyway, skip that package, or abort).

**5.7 Apply version changes** using the Renovate PR as reference for which files need updates. Update ALL occurrences (e.g., a dependency pinned in multiple groups in pyproject.toml or appearing in both `dependencies` and `devDependencies`).

**5.8 Apply code changes** if breaking changes require fixes. If the fix is too complex for a version bump session, skip it and flag for the user.

**5.9 Identify New Feature Opportunities**

For patch releases with no new features in the changelog, skip this step.

Review the changelog and migration guides already gathered in Steps 5.1-5.3 for notable new features that could improve the codebase. Highlight at most 5 of the most impactful features per package. Look for:

- New recommended patterns replacing deprecated ones
- New built-in functionality that replaces custom implementations you maintain
- New performance features (e.g., tree-shaking, lazy loading, reduced bundle size)
- New type safety improvements that catch bugs at compile time rather than runtime

Present all features in a single table using AskUserQuestion. The "Suggested Action" column is the agent's recommendation; the user may override it.

```
| Package | Feature | Benefit | Effort | Suggested Action |
|---|---|---|---|---|
| some-lib | New config API | Cleaner setup, less boilerplate | Low | Apply now |
| some-orm | Schema builder | Better type inference | High | Separate spec |
```

Options per feature (decision values for the summary: `Applied`, `Deferred`, `Skipped`):

1. **Apply now** - Apply the change as part of this upgrade (low-effort features only)
2. **Create spec** - Note as "Deferred" in the summary. The user can later use `/spec` to plan the work.
3. **Skip** - Not interested in this feature

Rules:

- When multiple packages have new features in the same session, present features package by package rather than all at once.
- Features that require touching many files should be flagged as "Separate spec recommended" in the Suggested Action column.
- If the user picks "Apply now" for a feature, apply the code changes immediately. If the change turns out to be more involved than expected, stop and suggest creating a spec instead.
- This step runs after 5.8 and before Step 6. Code changes from "Apply now" are subject to the same Step 6 verification.

### 6. Update Lock Files and Verify

**Lock file strategy varies by ecosystem.** For most ecosystems, use in-place update commands. For Python/uv batch upgrades, delete and regenerate cleanly to avoid iterative failures with `exclude-newer` safety windows.

| Ecosystem    | Update Lock File                     | Verify                                                              |
| ------------ | ------------------------------------ | ------------------------------------------------------------------- |
| Node.js      | `npm install`                        | `npm run build && npm test`                                         |
| Python       | `rm uv.lock && uv lock && uv sync`  | `uv run ruff check . && uv run ruff format --check . && uv run pytest` (project-pinned ruff; use `uvx ruff` only if ruff isn't a dev dependency) |
| Go           | `go mod tidy`                        | `go build ./... && go test ./...`                                   |
| Terraform    | `terraform init -upgrade`            | `terraform fmt -check -recursive && terraform validate`             |
| Helm         | `helm dependency update`             | `helm dependency build && helm template . > /dev/null` (catches removed/renamed values fields) |
| CI (Actions) | N/A                                  | Lint workflows with `actionlint` if available; confirm SHA-pin comments use the precise patch tag (e.g. `# v4.2.2`), per YourVid CLAUDE.md |
| Docker/Tools | N/A (no lock file)                   | N/A                                                                 |

**Regenerate codegen artifacts.** If upgrading packages that produce code (e.g., `@mikro-orm/*`, `prisma`, `@graphql-codegen/*`, `@openapitools/openapi-generator-cli`, protobuf compilers), run the project's regen scripts after the lock file update but before tests. Check `package.json` scripts for names like `codegen`, `generate`, `<package>:*`, or `Makefile` targets. Without this, generators can produce code that compiles but fails at runtime — MikroORM in particular has been a recurring source of post-upgrade bugs caught only after deploy.

**Terraform caveat:** After updating provider versions, run `terraform init -upgrade` in **every directory containing a `.terraform.lock.hcl`** to regenerate lock file hashes. These lock files must be committed to Git — CI runs `terraform init` (not `-upgrade`) and will fail if the lock file pins the old provider version. If backend credentials are unavailable locally, add `-backend=false` to skip state backend initialization.

**Go caveat:** Never delete `go.sum` — it contains cryptographic checksums for security verification, not version pins.

**Python/uv caveat:** NEVER pass `--exclude-newer` as a flag to `uv lock` — it bakes a fixed timestamp into `uv.lock`'s `[options]` section, silently blocking all future resolutions. Always let the global uv config (`~/.config/uv/uv.toml`) control this. After locking, verify `uv.lock` has no `[options] exclude-newer` entry.

If verification fails, proceed to Step 7 before retrying.

### 7. Handle Failures

1. Identify which package caused failure (check error messages, bisect if unclear)
2. Revert that package only: `git restore <affected-files>`
3. Re-run lockfile generation and verification
4. Note failure in summary, continue with remaining upgrades

If a Python package fails because it's too new for the safety window (missed by Step 3's date check), revert it in `pyproject.toml`, re-run `rm uv.lock && uv lock`, and mark it as **Deferred (Safety Window)** instead of Failed.

### 8. Generate Summary

```markdown
## Dependency Upgrade Summary

### Upgraded

| PR  | Package | Version | Breaking Changes | Files |
| --- | ------- | ------- | ---------------- | ----- |

### Unverified (Changelog Inaccessible)

| PR  | Package | Reason |
| --- | ------- | ------ |

### Skipped (Auto)

| PR  | Package | Reason |
| --- | ------- | ------ |

### Deferred (Safety Window)

| PR  | Package | Version | Release Date | Eligible After |
| --- | ------- | ------- | ------------ | -------------- |

### Failed (Reverted)

| PR  | Package | Error |
| --- | ------- | ----- |

### New Features Available

| Package | Feature | Decision | Notes |
| --- | --- | --- | --- |

### Verification

- Lint: pass/fail
- Tests: pass/fail
- Build: pass/fail

### Next Steps

1. Review: `git diff`
2. Commit: `/commit` (will use `chore(deps):` format)
3. Push when satisfied — Renovate PRs auto-close when versions match main
```

## Special Cases

### Apache Beam (Always Skip)

Requires coordinated manual update:

1. Update Dockerfile base image (both stages)
2. Update `apache-beam` in pyproject.toml
3. Download constraints from matching Beam version tag
4. Regenerate: `uv pip compile --constraint=base_image_requirements.txt -o requirements.txt pyproject.toml`

### Helm Charts

**Chart version ≠ app version.** Redis chart 22→24 might only be Redis 8.2→8.4.

```bash
# Get actual app version
helm show chart oci://registry-1.docker.io/bitnamicharts/<chart> --version <version> | grep appVersion
```

**Changelog sources:**

1. `helm show chart` for appVersion
2. GitHub: `https://github.com/bitnami/charts/releases`
3. ArtifactHub: `https://artifacthub.io/packages/helm/bitnami/<chart>`

**Verification:**

1. Compare appVersion between current and target
2. Check app's changelog (e.g., Redis release notes)
3. Compare values.yaml structure for renamed/removed fields

### Monorepo Packages

MikroORM, ESLint, etc. updating multiple sub-packages are treated as single operations.

## Error Handling

| Error               | Action                               |
| ------------------- | ------------------------------------ |
| No Renovate PRs     | Check repo has Renovate configured   |
| PR body parse fails | Extract package from title only      |
| Uncommitted changes | Warn user, offer to stash            |
| Install fails       | Revert changes, continue with others |

## Related Skills

- `/commit` - Commit the prepared changes
- `/review` - Code review before committing
- `/spec` - Plan complex feature adoptions identified in Step 5.9
