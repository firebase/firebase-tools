---
name: commit
description: "Create git commits with conventional commit format. Use whenever the user asks to commit, save, or check in changes (\"commit this\", \"commit and push\"). Board-aware: takes an optional spec slug (or auto-detects one from the changed files against the central Backlog board) to enrich the commit body from that spec's board document and the resolved tasks' final summaries, runs every git op against the spec's repo via `git -C` so it can commit cross-repo from any cwd, and records each pushed {sha, ref} back onto the board — all without ever citing planning-layer identifiers in the message. Stages specific files by name (never git add -A by default), refuses to stage secrets/specs/.tasks, and after committing offers push plus lower-to-upper branch sync in one confirmation, then auto-watches the resulting CI runs via /watch-actions (passing --repo when the resolved repo differs from cwd) unless --no-watch is passed. Worktree-aware: when run from inside a linked worktree it commits that worktree's branch and lands it correctly — a deploy-mainline repo via a scoped PR with auto-merge-on-green (--hold to gate), a lower-branch repo via `wt merge` — and hard-stops before committing if asked to commit a deploy mainline while a worktree is active."
allowed-tools:
  - Bash(git -C:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git restore --staged:*)
  - Bash(git rev-parse:*)
  - Bash(git worktree list:*)
  - Bash(mktemp:*)
  - Bash(gh pr create:*)
  - Bash(gh pr merge:*)
  - Bash(gh pr view:*)
  - Bash(gh pr list:*)
  - Bash(wt merge:*)
  - Skill
  - mcp__backlog__task_list
  - mcp__backlog__milestone_list
  - mcp__backlog__task_view
  - mcp__backlog__document_list
  - mcp__backlog__document_search
  - mcp__backlog__document_view
  - mcp__backlog__task_edit
  - mcp__backlog__task_complete
argument-hint: "[<slug>] [--staged | --all] [--dry-run] [--no-watch] [--hold]"
---

# Git Commit Skill

Create well-structured git commits using conventional commit format and safe staging practices, translating **central Backlog board** context into plain-prose commit bodies. After a successful commit, optionally push (and, in multi-branch repos, sync to a paired branch) via a single confirmation, then automatically chain into `/watch-actions` to monitor the resulting CI/CD runs unless `--no-watch` is passed.

**Board-aware (additive).** When a spec is resolved **from the board** (Step 0), `/commit` reads that spec's board document and the resolved tasks' `finalSummary` for the motivation/behavior context that shapes the prose body (Step 3), and after each successful push records a `{sha, ref}` comment back onto the board (Step 9a). Spec resolution, the **`/commit`-is-`git -C`-retargetable** rule, degradation, write-back (mechanism + destination matrix + idempotency), post-resolution read-failure handling, and the no-planning-layer-references rule are all governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (the shared contract for `/review`, `/commit`, and `/review-pr`); this skill **cites** that contract and does not restate its rules. With no resolvable spec, board awareness adds nothing — `/commit` writes the same plain commit it always has.

Because the contract makes `/commit` **`git -C`-retargetable**, every git operation below runs through `git -C "$REPO_DIR"` against the **resolved repo**, so `/commit` can commit, push, and sync that repo **whether or not** the current working directory is inside it. `$REPO_DIR` is established in Step 0.

**Worktree-aware (additive).** When `/commit` is invoked from inside a **linked worktree** (Step 0.5), it commits the **worktree's** branch — overriding the board's `modifiedFiles`→primary-checkout target — and lands that branch per the resolved repo's deploy/branch policy (Step 7-B): a **deploy-mainline** repo via a scoped PR with auto-merge-on-green (`--hold` gates it to manual merge), a **lower-branch** repo via `wt merge --stage none <lower>` then a push of the lower branch from the primary checkout. It also **hard-stops before committing** if asked to commit a deploy mainline while any worktree is active (Step 0.5). Outside a worktree, none of this engages — behavior is unchanged. The worktree reconciliation contract is codified in `backlog-conventions.md` (the worktree-reconciliation section) and grounded in `docs/worktree-workflow.md` (`wt` lifecycle + the per-repo deploy/branch table); this skill **applies** it and does not restate it.

## Usage

- `/commit` - Stage relevant files by name and commit (default); auto-detects the spec from the changed files against the board (Step 0)
- `/commit <slug>` - Bind to the named spec on the board; that spec's tasks resolve the target repo and supply the body context. An **explicit** slug is **fail-closed**: if its board lookup fails / matches zero tasks, or its repo can't be resolved, `/commit` **stops** (per the contract) rather than degrading
- `/commit --staged` or `/commit -s` - Commit only currently staged changes
- `/commit --all` or `/commit -a` - Stage ALL changes including untracked (use with care)
- `/commit --dry-run` - Show what would be committed without committing
- `/commit --no-watch` - After pushing, do NOT auto-invoke `/watch-actions` (CI is normally watched automatically)
- `/commit --hold` - In a worktree on a deploy-mainline repo (Step 7-B), open the landing PR **without** auto-merge (you merge it manually). No effect outside the worktree deploy-mainline path.

The optional `<slug>` is the first positional argument and combines with any flag: `/commit my-feature-slug --staged`.

## Process

### 0. Resolve Spec and Target Repo

Resolve, in order: which board spec (if any) this commit belongs to, and **which repo** to operate on. Both follow the shared contract — **do not reinvent them here**; see **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (Sections 1 and 2). Summary of what this skill does with the contract's outputs:

1. **Spec resolution (contract Section 1).**
   - **Explicit slug** (`/commit <slug>`): resolve exactly as `/implement` does (`mcp__backlog__task_list` with the `milestone` filter, `milestone=<slug>` — the slug is the milestone's title). **Fail-closed** per the contract: if the lookup fails (MCP unreachable / paging completeness unprovable) or the slug matches **zero** tasks, **report the cause and stop** — never silently fall back to spec-less.
   - **Bare** (no slug): perform the **one** exhaustive board read and auto-detect the spec from the working changes (qualify each changed file to its full `<cwd-repo-name>/<path>` and match against tasks' `modifiedFiles` as full `<repo>/<path>`; rank by overlap). A single clear winner is selected and **announced** (an explicit slug would override it); an overlap **tie** or **zero** overlap selects **none** → proceed spec-less.

2. **Target-repo resolution (contract Section 2).** Once a spec is resolved, take the repo **name** from the resolved tasks' `modifiedFiles` `<repo>/` prefix (**not** the `repo:<name>` label), resolve the **path** to `~/Repositories/YourVid/<name>`, and **validate it is a git working tree**:

   ```bash
   REPO_DIR="$HOME/Repositories/YourVid/<name>"
   git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1
   ```

   Per the contract's failure rule, if no such directory exists, the path is not a git working tree, or the resolved tasks name **more than one** distinct repo and the call can't be scoped to one: a **bare** resolution drops to **spec-less**; an **explicit** resolution **fails closed**. Either way **name the specific problem** (missing path / not a git tree / repo-name collision).

3. **`REPO_DIR` (the resolution output that scopes every git op).**
   - **Spec resolved** → `REPO_DIR` is the validated resolved-repo path above. This holds **whether or not** cwd is inside it — `/commit` is `git -C`-retargetable (contract Section 3).
   - **Spec-less** (bare degradation, or no slug and nothing resolved) → set `REPO_DIR=.` (the current working directory). Behavior is then byte-for-byte the pre-board-awareness `/commit`.

   **Convention for the rest of this skill:** prefix **every** git command — status, diff, add, commit, log, branch, push, and the sync sequence — with `git -C "$REPO_DIR"`. With the spec-less `REPO_DIR=.`, `git -C .` is identical to the bare-cwd behavior, so the no-spec path is unchanged.

4. **Cwd-vs-resolved-repo note.** Compute once whether the resolved repo is the cwd's repo; this gates the cross-repo `--repo` watch handoff (Step 9):

   ```bash
   RESOLVED_TOPLEVEL=$(git -C "$REPO_DIR" rev-parse --show-toplevel 2>/dev/null)
   CWD_TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
   # cross-repo when RESOLVED_TOPLEVEL != CWD_TOPLEVEL
   ```

5. **Spec context for the body.** When a spec was resolved, hold onto the resolved slug and its resolved task IDs — these are **resolution inputs only**, consumed in Step 3 to read board context. They are **never** written into the commit message (contract Section 6); see Step 3 and **Rules**.

6. **Git-state preflight (before ANY staging or commit).** Detect an in-progress **rebase / merge / cherry-pick / revert** in the resolved repo and **abort before staging anything**. `git status`/`add`/`commit` can all succeed *mid-operation*, so do **not** rely on git erroring — probe the state explicitly:

   ```bash
   GIT_DIR=$(git -C "$REPO_DIR" rev-parse --absolute-git-dir)   # absolute, so markers resolve against REPO_DIR not cwd
   # rebase (apply or interactive), merge, cherry-pick, revert in progress?
   for marker in \
     "$GIT_DIR/rebase-merge" "$GIT_DIR/rebase-apply" \
     "$GIT_DIR/MERGE_HEAD" "$GIT_DIR/CHERRY_PICK_HEAD" "$GIT_DIR/REVERT_HEAD"; do
     [ -e "$marker" ] && echo "in-progress: $marker"
   done
   ```

   If any marker is present, **stop without staging or committing**: name the in-progress operation and tell the user to finish or abort it (`git -C "$REPO_DIR" rebase --continue|--abort`, `git -C "$REPO_DIR" merge --abort`, `git -C "$REPO_DIR" cherry-pick --abort`, `git -C "$REPO_DIR" revert --abort`) before re-running `/commit`. Committing into a half-finished operation would fold unrelated in-flight changes into this commit.

### 0.5 Worktree-Aware Target and Landing Mode

Layered **on top of** Step 0's `$REPO_DIR`. This step decides whether the commit targets a **linked worktree** (and therefore lands via reconciliation in Step 7's worktree path), and computes the deploy/branch facts those later steps need. It establishes the **worktree reconciliation contract** codified in `plugins/yourvid-tools/backlog-conventions.md` (the worktree-reconciliation section) and grounded in `docs/worktree-workflow.md` (the `wt` lifecycle + the per-repo deploy/branch table); this skill **applies** that contract and does not restate it.

1. **Detect a worktree-feature context (override the target).** A *linked worktree* is a second checkout whose per-worktree git dir differs from the shared common dir. Probe the **cwd** — the override is driven by *where `/commit` is invoked*, not by the Step 0 spec resolution:

   ```bash
   CWD_GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
   CWD_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
   # absolutize both before comparing — --git-dir is often relative (".git"), --git-common-dir absolute, so a raw string compare false-positives
   CWD_GIT_DIR=$(cd "$(dirname "$CWD_GIT_DIR")" 2>/dev/null && pwd)/$(basename "$CWD_GIT_DIR")
   CWD_COMMON_DIR=$(cd "$(dirname "$CWD_COMMON_DIR")" 2>/dev/null && pwd)/$(basename "$CWD_COMMON_DIR")
   ```

   When `CWD_GIT_DIR` ≠ `CWD_COMMON_DIR`, the cwd is inside a linked worktree. Resolve the **canonical repo** from the common dir (`<common-dir>` is `<canonical-repo>/.git`, so its parent is the canonical repo) and confirm it resolves under `~/Repositories/YourVid/<name>` — this is the same canonical-repo identity `/capture` labels and the contract's worktree-targeting rule names. In that case **override** the Step 0 target so the commit lands on the **worktree's** branch:

   - Set `WORKTREE_FEATURE=1`.
   - Set `REPO_DIR` to the worktree toplevel: `REPO_DIR=$(git rev-parse --show-toplevel)` (the cwd's worktree).
   - This **overrides** any `modifiedFiles`→primary-checkout `$REPO_DIR` from Step 0 (the spec's `modifiedFiles` name the *canonical* repo, which would otherwise resolve to the primary checkout — but a `/commit` run from inside the worktree must commit the **worktree's** branch, not the primary checkout's). The board-context reads from Step 0 (slug, task IDs, doc) are unaffected — only the **git target** changes.

   Otherwise (cwd's git-dir == common-dir → not inside a linked worktree, including the primary checkout of a repo that *has* worktrees): set `WORKTREE_FEATURE=0` and **leave `$REPO_DIR` exactly as Step 0 set it**. The non-worktree path keeps its existing target and existing Step 7/8 behavior verbatim.

2. **Resolve deploy/branch facts for `$REPO_DIR`.** Independent of the override, compute the facts Step 7's worktree path and the pre-commit gate below both need:

   ```bash
   TARGET_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
   WORKTREE_COUNT=$(git -C "$REPO_DIR" worktree list | wc -l | tr -d ' ')   # >1 ⇒ a worktree is active for this repo
   REPO_SLUG=$(git -C "$REPO_DIR" remote get-url origin)
   REPO_SLUG=${REPO_SLUG#*github.com[:/]}; REPO_SLUG=${REPO_SLUG%.git}        # owner/repo for gh --repo
   ```

   The **per-repo deploy/branch policy** (which branch is the push-deploy **mainline** and whether a **lower** work branch exists) is the confirmed table in `docs/worktree-workflow.md` — cited, not duplicated. Read it from there for the resolved repo; the live shape used below is just two predicates:

   - **deploy-mainline repo** — `TARGET_BRANCH` is that repo's mainline (`main`/`master`) and the repo has **no** lower work branch (per the table, e.g. `claude-code-plugins`, `license-enforcement`). Worktree feature branches here land via a **PR** (Step 7, deploy-mainline path).
   - **lower-branch repo** — the repo has a lower work branch (`dev`/`staging`) that is **not** a deploy on push (per the table, e.g. `studio-backend` → `dev`, `studio-frontend-php` → `staging`). Worktree feature branches here land via `wt merge` **into the lower branch** (Step 7, lower-branch path), and the lower→mainline promotion stays a separate PR.

3. **Pre-commit hard-stop on an active-worktree deploy mainline (BEFORE any staging or commit).** This guard runs **here**, before Step 1/2 ever stage or Step 5 ever commits — a commit must never be stranded directly on a deploy branch while parallel worktree work is in flight (the contract's no-direct-mainline-push rule; `docs/worktree-workflow.md` "direct-to-mainline is allowed **only when no worktree is active**"). If **all** of:

   - `TARGET_BRANCH` is a deploy mainline (`main`/`master`) for `$REPO_DIR`, **and**
   - a worktree is active for the repo (`WORKTREE_COUNT` > 1),

   then **hard-stop without staging or committing**. This fires whether the deploy-branch target came from the primary checkout (the common case — `WORKTREE_FEATURE=0`, sitting on `main` while a sibling worktree exists) or, defensively, from a worktree itself checked out to a mainline. Report and stop:

   > `<branch>` is a deploy mainline for `<repo>` and a worktree is active (`git -C "$REPO_DIR" worktree list` shows N). Refusing to commit directly onto the deploy branch — parallel worktree work would race into a deploy. Commit inside a worktree instead (e.g. `wt switch -c <name>` / `wt switch -c <name> -x claude`), then re-run `/commit` from there; it will land the branch via a PR. (See `docs/worktree-workflow.md`.)

   Do **not** stage, commit, push, or watch. Nothing has happened yet, so this is a clean stop.

**Convention for the rest of this skill (extends Step 0's).** Every git op still runs through `git -C "$REPO_DIR"`, now against the *possibly-overridden* `$REPO_DIR`. When `WORKTREE_FEATURE=1`, Step 7 uses the **worktree reconciliation** path (deploy-mainline PR or lower-branch `wt merge`) instead of the plain push/sync; when `WORKTREE_FEATURE=0` and the pre-commit gate did not stop the run, Steps 1–9 are **unchanged**.

### 1. Analyze Changes

```bash
git -C "$REPO_DIR" status --porcelain
git -C "$REPO_DIR" diff --stat HEAD
git -C "$REPO_DIR" branch --show-current
git -C "$REPO_DIR" log --oneline -5
```

### 2. Determine What to Commit

**Default mode (recommended):**

- Review all modified, added, and deleted files
- Stage files **by name** using `git -C "$REPO_DIR" add <file1> <file2> ...`
- Group related files into a single logical commit
- **Never use `git add -A` or `git add .`** in this mode

Before staging, check each file against the safety list:

| Pattern                                    | Action         |
| ------------------------------------------ | -------------- |
| `.env`, `.env.*`                           | Never stage    |
| `credentials.json`, `*secret*`, `*token*`  | Never stage    |
| `*.key`, `*.pem`, `*.p12`                  | Never stage    |
| `node_modules/`, `vendor/`, `__pycache__/` | Never stage    |
| `specs/*.md`                               | Never stage    |
| `.tasks/` (implementation manifests)       | Never stage    |
| Generated docs / research `.md` files      | Never stage    |
| Large binaries (>1MB)                      | Ask user first |

If any file matches a safety pattern, warn the user and skip it.

**`--staged` mode:**

- Only commit what's already staged
- Do not stage additional files
- Warn if nothing is staged

**`--all` mode:**

- Stage all modified and new files with `git -C "$REPO_DIR" add -A`
- Still exclude files matching safety patterns above
- Warn user explicitly: "Staging all files including untracked. Verify nothing sensitive is included."

### 3. Read Board Context for the Body

This step runs **only when Step 0 resolved a spec**. Spec-less? Skip it entirely and write the body from the diff alone (Step 4) — no board reads. (The removed **file-based** detection — scanning `specs/*.md` + `.tasks/` — is **not** resurrected; spec-less means "no board context," not "fall back to files," per the contract's Section 4.)

With a spec resolved, gather the motivation/behavior context the prose body needs from the board — **not** from any local file:

1. **Read the spec's board document.** Locate the document tied to the resolved slug — search by slug (`mcp__backlog__document_search`), or list + match on the `slug:` line (`mcp__backlog__document_list`) — then `mcp__backlog__document_view` it for the feature's motivation, behavior changes, and tradeoffs. On **zero or ambiguous** matches (no document, or more than one), **skip the document** and fall back to the task `finalSummary`s + diff for context (**warn**); never block the commit on a missing/ambiguous doc.
2. **Read the resolved tasks' final summaries.** For each resolved task (the executable tasks of the resolved spec scoped to the one resolved repo, coordination parent excluded — contract Section 1), `mcp__backlog__task_view` it and read its prose `finalSummary` (what shipped) for the concrete behavior that landed.
3. **Translate to prose (Step 4).** Use that understanding to describe the user-facing behavior and the *why*. The slug, task IDs, board document / milestone names, and any FR#-AC# / T-numbers are **resolution inputs only** — they are translated into plain prose and **never** appear in the message (contract Section 6; see **Rules**). "Raise state cap to 1 MiB" beats "implement FR1-AC1."

**Multi-spec guard (skip the SHA record, don't mis-attribute).** If the **staged file set plainly spans more than one spec** — i.e. the staged files map (by `modifiedFiles`) onto tasks belonging to **two or more different `milestone`s** (regardless of task status, per the contract's status-agnostic matching) — this commit is not cleanly one spec's work. **Announce it**, still write a sensible prose body (drawn from the diff, optionally augmented by whichever specs' context loaded), and **set a flag to SKIP the board SHA write-back in Step 9a** (recording the push against a single spec's tasks would mis-attribute it). The commit and push proceed normally; only the board record is suppressed.

**Post-resolution read-failure handling (contract Section 5).** If reading the board document or any resolved task's `finalSummary` comes back **partial, malformed, or timed-out**, do **not** present board context as complete: fall back to a **diff-only** message (Step 4 from the diff alone) and **warn** the user that board context was unavailable. Resolution already succeeded, so this does not change the repo target or the Step 9a write-back destination — it only degrades the *body source* to the diff and emits a warning.

### 4. Generate Commit Message

Use conventional commit format: `<type>(<scope>): <description>`

**Types:**

| Type       | Use for                                |
| ---------- | -------------------------------------- |
| `feat`     | New features or capabilities           |
| `fix`      | Bug fixes                              |
| `docs`     | Documentation only                     |
| `style`    | Formatting, no code change             |
| `refactor` | Code restructuring, no behavior change |
| `perf`     | Performance improvements               |
| `test`     | Adding or updating tests               |
| `chore`    | Maintenance, dependencies, tooling     |

**Rules:**

- First line under 72 characters
- Use present tense ("add" not "added")
- Scope should reflect the area changed (e.g., `auth`, `api`, `ui`)
- Focus on _why_, not _what_
- **Never reference the planning layer in the message** — none of: board/task IDs, `spec:<slug>` slugs, board document or milestone names, `FR#-AC#` IDs, `T`-numbers, or spec/doc paths (contract §6). Translate to plain prose: "raise state cap to 1 MiB" beats "implement FR1-AC1." The board↔git link is **one-directional** — the board records this commit's SHA (Step 9a); nothing in the message or code points back at it. Step 5 scans for these before committing.

**Commit message body (with or without an underlying spec):**

The body's job is to explain _why_ in prose a future reader can decode without access to the original spec. List the specific user-facing behavior changes, the motivation (incident, deadline, performance, compliance), and any non-obvious tradeoffs. Do NOT include any planning-layer reference (board/task IDs, slugs, doc/milestone names, FR#-AC#, T-numbers, spec/doc paths).

```
feat(auth): generate 256-bit password reset tokens

Tokens now expire after 1 hour and are invalidated on first use.
The prior implementation accepted the same token indefinitely,
flagged in a security review.
```

```
fix(api): handle race condition in concurrent user updates

Two simultaneous updates to the same user could overwrite each
other. Added optimistic locking via a version field — concurrent
writers now retry on stale-version rejection.
```

### 5. Execute Commit

**No-planning-layer-references scan (mandatory, BEFORE committing).** Enforce contract Section 6 on **both** the drafted commit message **and** any source lines this run staged. Scan for planning-layer identifiers — board/task IDs, `spec:<slug>` slugs, board document / milestone names, `FR#-AC#`, `T`-numbers, and spec/doc paths (incl. `specs/*.md`). The deterministic logic lives in the committed `scan-planning-refs.sh` script (its generic ERE plus the resolved spec's literal identifiers are the same checks the inline grep used to run); this skill resolves it and calls it twice — once over the **staged diff** (`--mode diff`, added lines only) and once over the **drafted message** (`--mode text`).

**Resolve the script.** Prefer the loaded plugin root; fall back to the newest cached copy only when `CLAUDE_PLUGIN_ROOT` is unset (the `scripts/README.md` snippet):

```bash
SCAN=""
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh" ]; then
  SCAN="${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh"
else
  SCAN=$(ls -t "$HOME"/.claude/plugins/cache/*/yourvid-tools/*/scripts/scan-planning-refs.sh 2>/dev/null | head -1)
fi
[ -n "$SCAN" ] && [ -f "$SCAN" ] || SCAN=""
```

**Confirm the protocol** before trusting the script: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh" --protocol` as its own (auto-approved) command and verify it prints exactly `1`; on any other output — a cache skew — take the fail-safe path. Two **must-nots** keep it prompt-free: do **not** wrap it as `[ "$(bash … --protocol)" = "1" ]` (the hook rejects `$(`), and do **not** invoke through a `$SCAN` **variable** — the hook matches the literal `${CLAUDE_PLUGIN_ROOT}` token (or a literal cache path), never a variable, so `bash "$SCAN" …` would prompt. The `SCAN` resolution above is only to confirm the script *exists* and to recover the literal cache path on the `CLAUDE_PLUGIN_ROOT`-unset fallback.

**Capture the inputs to temp files, then invoke with a redirect (never a pipe).** The auto-approve hook forbids `|`, so do **not** run `git diff | bash <script>`. Instead capture each input and feed it via `< "$TMP"`:

- **Staged diff:** run `git -C "$REPO_DIR" diff --cached` and write its output to a temp file with the **Write** tool (e.g. `DIFF_FILE=$(mktemp)`); this avoids a `>` redirect, which the hook also forbids.
- **Drafted message:** you already hold the message text — write it to its own temp file (`MSG_FILE=$(mktemp)`) with the **Write** tool.

Then call the script as **standalone** auto-approvable commands — first token `bash`, then the **literal** `${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh` (on the `CLAUDE_PLUGIN_ROOT`-unset fallback, paste the resolved absolute cache path literally instead — both match the hook; a `$SCAN` variable does **not**), then flags, literal needles, stdin redirect — no substitution, chaining, or pipe. Pass the resolved spec's literal identifiers (bare slug, milestone name, document title) as positional needles so a bare kebab slug the generic pattern would miss is still caught:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh" --mode diff "<resolved-slug>" "<milestone-name>" "<doc-title>" < "$DIFF_FILE"   # spec-less: no needles
bash "${CLAUDE_PLUGIN_ROOT}/scripts/scan-planning-refs.sh" --mode text "<resolved-slug>" "<milestone-name>" "<doc-title>" < "$MSG_FILE"
```

The script exits **0** = clean (no in-scope match), **1** = at least one finding (printed as `path:line` for the diff, `line <n>` for the message), **2** = internal error. Spec-less? Pass no needles — the generic patterns still run.

**On a finding (exit 1):** the existing remediation. If the **message** scan flagged a line, **rewrite the message in prose** before committing. If the **staged diff** scan flagged a `path:line`, treat it as a finding: fix the source (or, if it's intentional product code unrelated to planning, confirm with the user) — do not let a planning-layer reference reach git history. The board-side `{sha, ref}` comment (Step 9a) is the **only** exempt direction (board→git is fine; git→board is not).

**Fail-safe (exit 2, or `SCAN` unresolved/protocol-skew):** never treat a non-clean scan as a pass (`scripts/README.md` fail-safe rule). Fall back to the compact inline grep below over the same two inputs; if even that cannot run, **warn and stop** — do **not** commit on an unverified scan:

```bash
# Fallback only — primary path is scan-planning-refs.sh above.
grep -nEi 'specs?/|\.tasks/|spec:[a-z0-9-]+|FR[0-9]+-AC[0-9]+|\bT-?[0-9]+\b|task[ _-]?id' "$DIFF_FILE" "$MSG_FILE" || true
# Plus the resolved literals (only the actual planning names, so unrelated kebab strings don't false-positive):
grep -nF "<resolved-slug>" "$DIFF_FILE" "$MSG_FILE" || true   # repeat per milestone / doc title
```

The fallback grep scans the **whole** diff (it has no added-line filter), so it is intentionally stricter than the script — a ref on a removed/context line it flags is a false positive you can clear by eye; it never lets a real added-line ref through.

**Secret scan (mandatory, BEFORE committing) — a SEPARATE Step-5 invocation alongside the no-planning-layer scan above.** Block a commit that stages a credential into file content. This scan is **independent** of the planning-ref scan: it has its own resolution, its own protocol check, and its own exit handling — the planning-ref scan above is unchanged. The deterministic logic lives in the committed `scan-secrets.sh` script (gitleaks in git-aware `--staged` mode against the resolved repo, emitting only redacted `file:line` + rule metadata — never the secret value). Run it over the **resolved repo's staged changes**, targeting `$REPO_DIR` via `--repo "$REPO_DIR"` so it scans the right repo whether or not cwd is inside it.

**Resolve the script.** Same pattern as above — prefer the loaded plugin root; fall back to the newest cached copy only when `CLAUDE_PLUGIN_ROOT` is unset (the `scripts/README.md` snippet). This resolution is **only** to confirm the script exists and to recover the literal cache path on the unset fallback — the invocation below uses the literal `${CLAUDE_PLUGIN_ROOT}` token (or that literal cache path), never a `$VAR`:

```bash
SECRET_SCAN=""
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh" ]; then
  SECRET_SCAN="${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh"
else
  SECRET_SCAN=$(ls -t "$HOME"/.claude/plugins/cache/*/yourvid-tools/*/scripts/scan-secrets.sh 2>/dev/null | head -1)
fi
[ -n "$SECRET_SCAN" ] && [ -f "$SECRET_SCAN" ] || SECRET_SCAN=""
```

**Confirm the protocol** before trusting it: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh" --protocol` as its **own** (auto-approved) command and verify it prints exactly `1`. The same two **must-nots** apply: do **not** wrap it as `[ "$(bash … --protocol)" = "1" ]` (the hook rejects `$(`), and do **not** invoke through a `$SECRET_SCAN` **variable** — the hook matches the literal `${CLAUDE_PLUGIN_ROOT}` token (or a literal cache path), never a variable. If `SECRET_SCAN` is **unresolved** (empty) **or** `--protocol` prints anything other than `1`, take the **exit-2 path below** (warn loudly and proceed) — an unresolved/skewed scanner does **not** block the commit.

**Invoke** as a **standalone** auto-approvable command — first token `bash`, then the **literal** `${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh` (on the `CLAUDE_PLUGIN_ROOT`-unset fallback, paste the resolved absolute cache path literally instead; a `$SECRET_SCAN` variable does **not** match), then `--repo "$REPO_DIR"`. No pipe, no command substitution (`$(`/backtick), no `>` redirect, no chaining:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/scan-secrets.sh" --repo "$REPO_DIR"
```

Branch on the **exit code** (never on stdout text, except to read the exit-2 subtype token):

- **Exit 0 — clean** (no secret staged): proceed to the commit below.
- **Exit 1 — secret found: HARD-BLOCK.** Do **not** commit. Show the redacted finding line(s) from stdout verbatim (each `<file>:<line>\t<RuleID>: <Description>` — these are already redacted; the secret value is never printed). Tell the user how to resolve: **remove the secret** from the staged change, **or**, for a **confirmed** false-positive, add a same-line `# gitleaks:allow` marker on the flagged line. Then **STOP** — do not run `git commit`, do not push, do not continue any later step.
- **Exit 2 — unavailable: WARN LOUDLY and proceed.** Read the stdout subtype token and print the matching notice, then continue the commit (never silently skip):
  - stdout is exactly `unavailable: missing` → warn: "secret scan SKIPPED — install gitleaks (`brew install gitleaks`)".
  - stdout is exactly `unavailable: errored` → warn: "secret scan could not run (gitleaks errored/timed out) — proceeding unscanned".
  - **Unresolved script or protocol mismatch** takes this **same** path: warn loudly that the secret scan could not run (scanner unresolved / protocol-skew) and proceed unscanned.

  In every exit-2 case the warning is mandatory and the commit continues — but it is **loud**, never silent.

```bash
git -C "$REPO_DIR" commit -m "$(cat <<'EOF'
<type>(<scope>): <description>

[Optional body: prose explaining why — no planning-layer references of any kind]
EOF
)"
```

### 6. Verify

```bash
git -C "$REPO_DIR" status
git -C "$REPO_DIR" log --oneline -1
```

Confirm to user: what was committed, which files, the commit hash, and — when Step 0 retargeted to a non-cwd repo — **which repo** (`$REPO_DIR`) it landed in.

### 7. Offer Push (and Sync, or Land a Worktree Branch)

What this step does depends on the landing mode fixed in Step 0.5:

- **`WORKTREE_FEATURE=0` (not a worktree-feature context)** → the **existing** push-and-sync flow below (**Step 7-A**), **byte-for-byte unchanged**. This is the path for a plain checkout — including the primary checkout of a repo that has worktrees (that case either already hard-stopped in Step 0.5 when on a deploy mainline, or is on a non-mainline branch where the existing flow is correct).
- **`WORKTREE_FEATURE=1` (committed on a linked worktree's branch)** → the **worktree reconciliation** flow (**Step 7-B**), which lands the worktree branch onto its target per the repo's deploy/branch policy from Step 0.5 — a scoped PR for a deploy-mainline repo, `wt merge` for a lower-branch repo. The plain Step 7-A sync flow is **skipped** in this mode.

#### Step 7-A — Plain push and sync (existing behavior, `WORKTREE_FEATURE=0`)

After verification, first detect whether a multi-branch sync is also available, then ask **once** so push and sync share a single confirmation.

**Detect sync candidates.** List remote-tracking branches and match the current branch against the known pairs:

```bash
REMOTES=$(git -C "$REPO_DIR" branch -r --format='%(refname:short)')
```

Recognized pairs (lower → upper):

| Lower branch | Upper branch |
| ------------ | ------------ |
| `dev`        | `main`       |
| `develop`    | `main`       |
| `staging`    | `master`     |
| `staging`    | `main`       |

A sync candidate exists when the current branch matches a "lower" entry AND `origin/<upper>` is present in `REMOTES`. Note that some lowers map to **more than one** recognized upper (e.g. `staging` → both `master` and `main`); collect **every** upper whose `origin/<upper>` exists. If the current branch is an upper (`main`/`master`) or is not a recognized lower, there are no sync candidates.

**Prompt shape depends on what's available** (always via `AskUserQuestion`):

- **No sync candidate** (single-branch repo / no matching upper present) — simple push confirm:

  > "Push to `origin/<current-branch>`? — push / no" (push recommended)

- **Exactly one sync candidate** — one prompt, three options:

  > "Push to `origin/<current>` and sync to `<upper>`? Sync will checkout `<upper>`, merge `<current>`, push, return to `<current>`. — push and sync / push only / no" (push and sync recommended)

- **Multiple sync candidates** — because the sync target is irreversible, do not guess. Ask which upper to sync to, offering each recognized upper plus push-only and no:

  > "Push to `origin/<current>`, then sync to which branch? — sync to `<upperA>` / sync to `<upperB>` / push only / no"

  The chosen upper becomes `<upper>` for the sync below.

Interpret the answer:

- `no` → end with the existing summary; do not push, sync, or watch.
- `push only` / `push` → push (below), then **skip the sync** and continue to Step 9.
- `push and sync` / `sync to <upper>` → push (below), then run the sync.

**Push:**

```bash
# Use -u when there's no upstream tracking branch
if git -C "$REPO_DIR" rev-parse --abbrev-ref --symbolic-full-name @{u} > /dev/null 2>&1; then
  git -C "$REPO_DIR" push origin HEAD
else
  git -C "$REPO_DIR" push -u origin HEAD
fi
```

If push fails (non-fast-forward, network, etc.), report the git error verbatim and stop. Nothing irreversible has happened yet; do not proceed to Step 8 or 9.

The current branch's push is the **first** successful push. Record its `{sha, ref}` to the board now via **Step 9a** (one record per successful push), then capture the SHA for Step 9's watch-coverage signal:

```bash
CURRENT_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
PUSHED_SHAS="$(git -C "$REPO_DIR" rev-parse HEAD)"
# → Step 9a: append {sha: <PUSHED_SHAS>, ref: <CURRENT_BRANCH>} to the board (unless skipped)
```

#### Step 7-B — Land the worktree branch (`WORKTREE_FEATURE=1`)

Reached only when Step 0.5 set `WORKTREE_FEATURE=1`, i.e. the commit just landed on a **linked worktree's** branch (`$REPO_DIR` is the worktree, `TARGET_BRANCH` is its feature branch). The plain Step 7-A flow is **not** run in this mode. The landing path is fixed by the repo's deploy/branch policy from Step 0.5; pick exactly one. Throughout, every `gh` call is **`--repo "$REPO_SLUG"`-scoped** and every `wt` call is **`-C "$REPO_DIR"`-scoped** (the contract's "scoped `gh`/`wt`" rule).

`CURRENT_BRANCH` here is the worktree's feature branch:

```bash
CURRENT_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)   # the worktree's feature branch
```

##### 7-B.1 — Deploy-mainline repo → push + scoped PR (+ auto-merge unless `--hold`)

When `$REPO_DIR` is a **deploy-mainline** repo (Step 0.5), the feature branch lands onto the mainline through a **PR** — never a direct mainline push (the contract; `docs/worktree-workflow.md` "push-deploy mainline → PR-gated"). Let `<mainline>` be that repo's mainline (`main`/`master` from the confirmed table).

**Confirm with the operator once** (via `AskUserQuestion`), stating the concrete plan and whether auto-merge will be enabled:

> "Land `<CURRENT_BRANCH>` onto `<mainline>` of `<REPO_SLUG>` via a PR? "
> — without `--hold`: "The PR will auto-merge (squash) once required checks pass."
> — with `--hold`: "The PR will be opened **without** auto-merge — you merge it manually."
> Options: **land** / **no** (land recommended).

`no` → stop after the commit (it is safe on the worktree branch; nothing pushed); end with the summary, no watch.

On **land**:

1. **Immediately-before-push recheck.** Even though Step 0.5 already gated, re-assert right before the push that we are **not** about to push a deploy mainline directly: confirm `CURRENT_BRANCH` is the feature branch (≠ `<mainline>`). This is the best-effort second check the contract requires (pre-commit gate **and** immediately-before-push recheck; a residual single-operator race is accepted — no distributed lock). If somehow `CURRENT_BRANCH` == `<mainline>`, **stop** (a worktree should never be on the mainline here) rather than push the mainline.

2. **Push the feature branch** (never the mainline):

   ```bash
   git -C "$REPO_DIR" push -u origin "$CURRENT_BRANCH"
   ```

   On push failure (non-fast-forward, network), report the git error verbatim and stop — nothing else has happened. A `! [rejected]` means the remote branch moved: `git -C "$REPO_DIR" fetch origin "$CURRENT_BRANCH"` then rebase onto it and retry (never `--force` — `docs/worktree-workflow.md`).

   This push is a successful push of the **feature branch** → record its `{sha, ref}` via **Step 9a** like any other push:

   ```bash
   PUSHED_SHAS="$(git -C "$REPO_DIR" rev-parse HEAD)"
   # → Step 9a: append {sha: <PUSHED_SHAS>, ref: <CURRENT_BRANCH>} to the board (unless skipped)
   ```

3. **Create or adopt the PR** (scoped). First check for an **existing open PR** for this head/base — adopt it rather than failing or duplicating:

   ```bash
   PR_NUMBER=$(gh pr list --repo "$REPO_SLUG" --head "$CURRENT_BRANCH" --base "<mainline>" \
     --state open --json number --jq '.[0].number // empty')
   ```

   - **No existing PR** → create one (`--fill` reuses the commit subject/body; the PR body is GitHub PR-UI metadata, exempt from the no-planning-layer rule per the contract, but `--fill` keeps it to the commit's plain prose anyway):

     ```bash
     gh pr create --repo "$REPO_SLUG" --base "<mainline>" --head "$CURRENT_BRANCH" --fill
     ```

     then read back its number:

     ```bash
     PR_NUMBER=$(gh pr view "$CURRENT_BRANCH" --repo "$REPO_SLUG" --json number --jq '.number')
     ```

   - **Existing PR** → adopt that `PR_NUMBER`; note in the summary that an existing PR was reused (do not open a second one).

4. **Auto-merge unless `--hold`.**

   - **Default (no `--hold`)** → enable auto-merge so the PR squash-merges itself once required checks pass:

     ```bash
     gh pr merge --repo "$REPO_SLUG" --auto --squash "$PR_NUMBER"
     ```

     **On auto-merge-unavailable** (the repo lacks the auto-merge setting / branch protection isn't configured / the command errors that `--auto` can't be set) → **do not** merge directly and **do not** remove the worktree. **Leave the PR open**, **retain the worktree**, and report the manual steps:

     > Opened PR #`<PR_NUMBER>` (`<url>`), but auto-merge is unavailable on `<REPO_SLUG>`. The branch is pushed and the PR is open; the worktree is kept. Enable it manually with `gh pr merge --repo <REPO_SLUG> --auto --squash <PR_NUMBER>` once auto-merge/branch-protection is configured, or merge the PR by hand when checks are green. The worktree is removed later by `/watch-actions` only after the PR actually merges.

     Then still hand off to `/watch-actions` (step 5) so CI is tracked — the PR being open is the intended state, not a failure.

   - **`--hold`** → open the PR **without** auto-merge; report it as **awaiting manual merge**:

     > Opened PR #`<PR_NUMBER>` (`<url>`) on `<REPO_SLUG>` **without** auto-merge (`--hold`). Merge it manually when ready; the worktree is kept until the PR merges.

5. **Hand the PR number to `/watch-actions`** (the worktree cleanup tail — FR4 — lives there; this skill only hands off). Invoke the **Skill** tool (unless `--no-watch`, in which case skip and say so) passing the **PR number** and the repo, both scoped to the worktree:

   - `--pr <PR_NUMBER>` — so `/watch-actions` can bounded-poll PR state after CI settles and, **only** once it has merged, offer the repo-scoped `wt remove` of the now-merged worktree (its cleanup tail).
   - `--repo "$REPO_DIR"` — the worktree path, so it resolves HEAD / repo identity / `.github/workflows` from the worktree (this is the same `--repo` handoff Step 9 already uses for a cross-repo watch; here it always applies because the worktree is never the session-spec's primary checkout).

   `/watch-actions` still auto-resolves its CI target from the worktree's `HEAD`; the `--pr` number drives only its post-merge cleanup. After handing off, the deploy-mainline worktree path is done — **skip Steps 7-A/8** entirely and let `/watch-actions` own the tail (do not also run the Step 9 auto-watch a second time; this *is* the watch handoff for this mode).

##### 7-B.2 — Lower-branch repo → `wt merge --stage none` into the lower branch

When `$REPO_DIR` is a **lower-branch** repo (Step 0.5), reconcile the worktree branch by merging it into the **lower** work branch locally (no deploy) via `wt merge` — exactly the case `docs/worktree-workflow.md` calls "lower work branch (dev/staging) → local merge". Let `<lower>` be that repo's lower branch (`dev`/`staging` from the confirmed table). `<lower>`→mainline stays a **separate** PR (out of this step).

1. **Resolve and validate the primary checkout FIRST — before the merge.** `wt merge` **removes the worktree** when it finishes (`docs/worktree-workflow.md`), so the subsequent `<lower>` push cannot run from `$REPO_DIR` (it will be gone). Resolve the **primary checkout** now and validate it, while the worktree still exists:

   ```bash
   PRIMARY_DIR=$(dirname "$CWD_COMMON_DIR")          # <canonical-repo>/.git → <canonical-repo>  (from Step 0.5)
   git -C "$PRIMARY_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1   # must succeed
   ```

   If `PRIMARY_DIR` is missing or not a git working tree, **stop before merging** (report it) — without a place to push `<lower>` afterward, do not start an irreversible merge-and-remove.

2. **Require a clean worktree.** `wt merge` defaults to sweeping uncommitted changes into the squash (`--stage all`); we pass `--stage none` so it merges **only committed history**, but a dirty tree is still a hazard (and `wt remove` refuses dirty trees). Refuse unless the worktree is clean:

   ```bash
   git -C "$REPO_DIR" status --porcelain    # must be empty
   ```

   If non-empty → **stop**: "Worktree has uncommitted/untracked changes; commit or stash them before landing (`wt merge` would otherwise sweep or refuse them). Re-run `/commit` once clean." Do not merge.

3. **Reconcile via `wt merge --stage none` into `<lower>`** (scoped to the worktree). This squashes + rebases + fast-forwards `<lower>` **locally** and then removes the worktree — it does **not** push, so it cannot deploy by itself:

   ```bash
   wt -C "$REPO_DIR" merge --stage none <lower>
   ```

   On conflict / non-zero exit, surface it loudly and stop — the worktree is left in place for the operator to resolve (`docs/worktree-workflow.md` "when reconciliation goes sideways"); do not push.

4. **Push `<lower>` from the PRIMARY checkout** (the worktree is now gone). The feature work is folded into `<lower>` locally; publish it from `PRIMARY_DIR`:

   ```bash
   git -C "$PRIMARY_DIR" checkout <lower>
   git -C "$PRIMARY_DIR" pull --ff-only
   git -C "$PRIMARY_DIR" push origin <lower>
   ```

   `<lower>` is **not** a deploy branch, so this push is safe (no PR gate needed for the lower branch itself). On push failure, report verbatim and print recovery (`git -C "$PRIMARY_DIR" fetch origin <lower>` then rebase/merge and re-push). This is a successful push of `<lower>` → record its `{sha, ref}` via **Step 9a** (destination is unchanged — the board task; the ref is `<lower>`):

   ```bash
   PUSHED_SHAS="$(git -C "$PRIMARY_DIR" rev-parse <lower>)"
   # → Step 9a: append {sha: <PUSHED_SHAS>, ref: <lower>} to the board (unless skipped)
   ```

5. **Watch from the primary checkout.** Since the worktree is gone and `<lower>`'s push happened on `PRIMARY_DIR`, hand the auto-watch to the primary checkout: invoke `/watch-actions` (unless `--no-watch`) with `--repo "$PRIMARY_DIR"` and **no** `--pr` (the lower-branch path opens no PR, so there is no PR cleanup tail — FR4 is a no-op here). Then **skip Steps 7-A/8** (this mode handled its own push + watch).

There is **no** `<lower>`→mainline promotion in this step — that remains a separate, deliberate PR (open it later from `<lower>`, e.g. via `/review-pr`).

### 8. Multi-Branch Sync

Applies **only to the Step 7-A path**. When `WORKTREE_FEATURE=1` (Step 7-B ran), **skip this step entirely** — a worktree branch lands via its PR (deploy-mainline) or via `wt merge` into `<lower>` (lower-branch), never via this lower→upper checkout-and-merge sync.

Otherwise, run this step only when the user chose to sync in Step 7-A (`push and sync` / `sync to <upper>`), using the `<upper>` selected there. Otherwise skip silently.

Execute the sequence (checking each exit code):

```bash
git -C "$REPO_DIR" checkout <upper>
git -C "$REPO_DIR" pull --ff-only
git -C "$REPO_DIR" merge <current>      # if non-zero → conflict; see below
git -C "$REPO_DIR" push origin <upper>
git -C "$REPO_DIR" checkout <current>
```

Any non-zero exit halts the sequence — see **Partial-Failure Recovery** below, since the push in Step 7 already succeeded.

After a successful `git -C "$REPO_DIR" push origin <upper>`, the upper now carries its own SHA (a merge commit when the merge was not a fast-forward). This is a **second successful push**, so record **its** `{sha, ref}` to the board via **Step 9a** (the synced upper branch gets its own record), and capture the SHA so Step 9 can detect that a distinct upper SHA exists:

```bash
UPPER_SHA=$(git -C "$REPO_DIR" rev-parse <upper>)
PUSHED_SHAS="$PUSHED_SHAS $UPPER_SHA"
# → Step 9a: append {sha: <UPPER_SHA>, ref: <upper>} to the board (unless skipped)
```

On this success path the whole sequence has completed and the tree is back on `<current>`; **continue to Step 9** to auto-watch `HEAD`, then finish.

**On merge conflict** (non-zero exit from `git -C "$REPO_DIR" merge <current>`):

- Print: "Merge conflict on `<upper>` — resolve manually then re-run `/commit`"
- Leave the working tree on `<upper>` with the conflict in place — do **not** run `git -C "$REPO_DIR" merge --abort`
- The Step 7 push to `<current>` already landed, but the tree is mid-conflict on `<upper>`, so **do not auto-watch here** and **do not run Step 9** — go to **Partial-Failure Recovery** below, which reports what landed and prints the manual recovery commands (including how to finish or re-watch once the conflict is resolved)

### 9a. Record the Pushed `{sha, ref}` on the Board

Runs **per successful push** — once for the Step 7 current-branch push, and once more for the Step 8 upper-branch push when sync ran. This is governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (Section 5: write-back conventions); follow it, do not restate it.

**Gate — two scopes (whole-run vs per-push):**

Whole-run (record **nothing** for this run):

- **No spec resolved** (spec-less / bare degradation) — there is no board destination.
- **The multi-spec guard fired** (Step 3: staged set spans >1 spec) — **skip** all SHA records to avoid mis-attributing the push to a single spec; say so in the summary.

Per-push (skip **only** that branch's record, keep the others):

- **That push didn't happen** — "no push ⇒ no record" (contract Section 5): a `no` answer, a failed Step 7 push, or a mid-conflict Step 8 sync skips **only the corresponding** branch's record. A **successful** Step 7 current-branch push is still recorded **even if** the Step 8 upper sync later conflicts.

Otherwise, for **each** successful push append **one** `{sha, ref}` record (the pushed SHA + the branch ref — current branch for Step 7, `<upper>` for Step 8) via `mcp__backlog__task_edit commentsAppend` to the §5 **destination** (single-repo → the resolved repo's lowest-numbered executable task; cross-repo → the coordination parent), stamped with a **stable fingerprint derived from that push's SHA + ref** (so the Step 7 and Step 8 records never collide) for idempotency (on an uncertain result, re-read the task and check for the fingerprint before retrying — never duplicate, never drop). `commentsAppend` **only** — never toggle `status` or AC checkboxes (those belong to `/implement`).

This is the **one** exempt board↔git direction (board records the SHA; nothing in git points back — contract Section 6). A failure of the write-back itself is **not** a git failure: the push already landed, so report the write-back error and **resume the normal flow** — if the user requested a sync, proceed to **Step 8**; otherwise to **Step 9**. A write-back failure **never** skips a requested sync or any later step — it is a non-fatal warning, like the other post-push fallible actions.

### 9b. Ship-time archive offer (single-repo specs only)

A **purely additive, non-fatal** step: it runs after every successful push/sync has settled and Step 9a has recorded its SHA, and **before** the Step 9 auto-watch handoff. Whatever happens here — offer, archive, decline, or error — /commit **always proceeds unchanged to Step 9**: it never undoes the commit/push/sync, never aborts or skips the watch, and never alters any pre-existing /commit output. This is governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (Section 5's **archival exception** — the one place a non-`/implement` skill performs a `task_complete` lifecycle op); follow it, do not restate it.

**Eligibility — offer ONLY when ALL hold** (otherwise skip silently and behave exactly as before this step existed):

1. A **single spec resolved** in Step 0 (not spec-less) and the **multi-spec guard did not fire** (Step 3).
2. The spec is **single-repo** — the resolved tasks' `modifiedFiles` all share one `<repo>/` prefix and there is **no coordination parent**. A cross-repo spec is **never** offered here (its other repos may be unshipped; it archives via manual `backlog cleanup`). **Fail closed** (no offer) if single-repo shape **cannot be unambiguously proven** — e.g. the resolved tasks' `modifiedFiles` span more than one `<repo>/`, or the milestone has (or, per a `completed/` check, ever had) a coordination parent. Never infer single-repo from the mere *absence* of a now-visible parent — an archived parent must not let a cross-repo remainder pass as single-repo.
3. The commit **reached a deploy/mainline branch** — the Step 7-A current branch is `main`/`master`, **or** a Step 8 lower→upper sync to `main`/`master` completed this run. A lower-branch-only push (e.g. `staging` with no sync) is **not** a ship → no offer. A **worktree landing** (`WORKTREE_FEATURE=1`, Step 7-B) **never** qualifies at commit time: a deploy-mainline worktree merges to the mainline **asynchronously via the PR** (after CI, not this run), and a lower-branch worktree only reached `<lower>` — so neither is a ship here (the deferred-promotion case is judged later, e.g. when `/watch-actions` reports the PR merged).
4. **Fresh re-read** the spec's tasks now (`mcp__backlog__task_list milestone=<slug>`, paged to provable completeness): **every** executable task must be `Done`. If the read errors / times out / can't be proven complete → **no offer** (fail closed). If any task is not `Done` → no offer.
5. **The spec's work is fully committed** in the resolved repo — `git -C "$REPO_DIR" status --porcelain` shows **no staged or unstaged changes** to any of the resolved tasks' in-repo `modifiedFiles`. A spec whose tasks are `Done` but whose code is only partially committed is **not** shipped → no offer. (This is a cheap completeness check; it does **not** prove the pushed ref contains every task's commits — that deeper per-task git verification stays out of scope, with the operator confirmation as the backstop.)

**Offer.** When eligible, `AskUserQuestion`: *"All N tasks of `<slug>` are Done and this commit reached `<branch>` — archive them to `completed/`?"* — options **archive** / **keep visible**, and **state `<branch>`** so the operator can judge a deferred-promotion case. Make clear the offer fires when the commit **reached** `<branch>`, **before** the deploy/CI workflow is verified — so the operator should **keep visible** if they want to wait for the deploy to go green (archiving does **not** confirm a successful deploy). "keep visible" is the safe default.

- **keep visible / ESC** → archive nothing; tasks stay `Done` and visible; proceed to Step 9.
- **archive** → run the archival below.

**Archival (on confirm):**

1. **Re-read once more** (`task_list milestone=<slug>`, paged) immediately before touching anything. **Fail closed** — archive **nothing**, warn, and proceed to Step 9 — if that read errors/times out, the task **membership changed**, or **any** task is no longer `Done` since the offer.
2. Archive the spec's **executable tasks** via `mcp__backlog__task_complete`, in **ascending `TASK-<n>` numeric order** (deterministic; `TASK-9` before `TASK-10`).
3. **Partial failure:** if a `task_complete` errors part-way, **stop** and report exactly which task IDs were archived and which were not. The board is left **reconcilable**: a re-run archives only the still-active remainder, and `task_complete` on an already-archived task is **idempotent** (already in `completed/` ⇒ a no-op, not a hard error). On an **uncertain** result (timeout / unknown outcome), **re-read that task** (`task_view`) to reconcile its actual state before continuing; if reconciliation also fails, report that task as **unknown** (neither confirmed-archived nor confirmed-active) rather than guessing.
4. Report the archived set; proceed to Step 9.

`task_complete` here is the **only** lifecycle operation `/commit` performs (see allowed-tools + the contract's Section 5 archival exception). There is no coordination parent to mark — eligibility #2 excludes cross-repo.

### 9. Auto-Watch CI

**Skip this step when Step 7-B already ran (`WORKTREE_FEATURE=1`)** — that path issued its own `/watch-actions` handoff (with `--pr` against the worktree for a deploy-mainline repo, or against `PRIMARY_DIR` for a lower-branch repo), so re-invoking here would double-watch. This step is the Step 7-A auto-watch only.

After a successful push (and sync, if it ran), automatically monitor the resulting CI/CD runs — no prompt.

Skip auto-watch entirely if the user passed `--no-watch`; instead end with the existing summary and note that `/watch-actions` can be run manually.

Otherwise, check whether the **resolved** repo has at least one GitHub Actions workflow file. Use a probe that succeeds when **either** extension is present and does not error when the directory is missing or only one extension exists:

```bash
if find "$REPO_DIR"/.github/workflows -maxdepth 1 \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | grep -q .; then
  # at least one .yml or .yaml workflow file exists — auto-watch
fi
```

`find ... | grep -q .` is true only when at least one match is printed, so a directory holding just `.yml` (or just `.yaml`) files still triggers auto-watch. If nothing matches (directory missing, empty, or no `.yml`/`.yaml` files), there is nothing to watch — skip silently and end with the summary.

If workflow files exist, invoke the `/watch-actions` skill via the **Skill** tool (no prompt) with **no SHA argument** — `/watch-actions` takes no SHA (only `--workflow` / `--run`) and auto-resolves its target from `HEAD`'s SHA.

**Cross-repo watch handoff.** When Step 0 retargeted to a repo other than the cwd's repo (`RESOLVED_TOPLEVEL` ≠ `CWD_TOPLEVEL`), pass **`--repo <resolved-repo>`** to `/watch-actions` so it resolves HEAD, repo identity, and `.github/workflows` from the **resolved** repo rather than the cwd — otherwise the auto-watch would track the wrong repo's CI. `/watch-actions` accepts `--repo <path-or-name>` for exactly this handoff and resolves the value via the same name→path convention (see its **Step 0**); pass the resolved repo path (or its bare name). When the resolved repo **is** the cwd's repo (or the run is spec-less, `REPO_DIR=.`), invoke `/watch-actions` with **no** `--repo` exactly as before. So it watches the resolved branch's runs for the commit you just pushed.

`PUSHED_SHAS` is **not** passed to `/watch-actions`; it serves only as the signal for whether a sync produced a distinct upper-branch SHA. When it holds more than the current `HEAD` (i.e. Step 8 added an upper-branch merge commit), that upper SHA falls outside what an auto-resolved-from-`HEAD` watch covers. In that case, note this limitation in the summary: the upper-branch deploy isn't auto-watched; the user should re-run `/watch-actions` from `<upper>` to cover its deploy workflow.

## Partial-Failure Recovery

The first **push** is the first irreversible action — the Step 7-A current-branch push, or, in worktree mode, the Step 7-B feature-branch push (deploy-mainline) or the `wt merge`/`<lower>` push (lower-branch). Once it succeeds, treat every later action (the Step 9a board write-back, the sync's `checkout` / `pull` / `merge` / upper `push`, the return-branch `checkout`, the Step 9b archival, and the `/watch-actions` invoke) as something that can fail **after** history has already moved. Never silently swallow such a failure. Every recovery command below targets the resolved repo, so keep the `git -C "$REPO_DIR"` prefix.

**Worktree-landing failures (Step 7-B)** carry their own in-step handling, but the same principles apply:

- **Deploy-mainline path.** The push and the PR creation/auto-merge-enable are each reported as they land. An auto-merge-unavailable result is **not** a failure (PR open + worktree retained + manual steps reported — see 7-B.1). If `gh pr create`/`merge` fails *after* the feature branch pushed, report that the branch is pushed (so the operator can open the PR by hand) and stop; the worktree is retained.
- **Lower-branch path.** `wt merge --stage none <lower>` **removes the worktree** on success — so a failure of the **subsequent `<lower>` push** leaves the merged history on the **primary checkout's** local `<lower>` (not lost): report that the worktree was reconciled and removed but `<lower>` is unpushed, and print the recovery (`git -C "$PRIMARY_DIR" fetch origin <lower>` → rebase/merge → `git -C "$PRIMARY_DIR" push origin <lower>`). If `wt merge` itself failed, the worktree is **still present** (it only removes on success) — the operator resolves the conflict in place or `wt -C "$REPO_DIR" merge` again.

When a step after the push fails:

1. **Report what completed.** State plainly which irreversible actions already landed — e.g. "pushed `<current>` to `origin/<current>`", and if reached, "pushed the merge to `origin/<upper>`". The user must know remote history already moved. A successful Step 7 push for which Step 9a already recorded the `{sha, ref}` stays recorded on the board — that's the intended one-directional link, not something to roll back.
2. **Restore the original branch when safe.** If the working tree is on `<upper>` with no conflict or uncommitted changes, run `git -C "$REPO_DIR" checkout <current>` to return the user to where they started. If a merge conflict or dirty tree blocks the checkout, do **not** force it — leave the tree as-is and say so.
3. **Print exact recovery commands** for the user to finish or retry by hand, for example:

   ```bash
   git -C "$REPO_DIR" checkout <upper>          # if not already there
   git -C "$REPO_DIR" fetch origin <upper>      # update remote-tracking ref without merging
   git -C "$REPO_DIR" merge origin/<upper>      # reconcile a diverged upper (or: rebase origin/<upper>)
   git -C "$REPO_DIR" merge <current>
   git -C "$REPO_DIR" push origin <upper>
   git -C "$REPO_DIR" checkout <current>        # return to your branch
   ```

   `--ff-only` can't reconcile a diverged upper (it refuses to merge when histories have diverged), so fetch and then merge (or rebase) `origin/<upper>` explicitly, resolving any conflicts by hand. Tailor the list to the actual failure point (omit steps already done; for a failed return checkout, just show `git -C "$REPO_DIR" checkout <current>`).

4. If the failure is the **Step 9a board write-back** or the **Step 9b archival**, the git work is already complete and safe — report the error (and that the push landed) and continue; do not treat it as a git failure. The 9b archival is **board-only** and carries its own fail-closed + partial-failure + idempotent-re-run handling (Step 9b), so it **self-reconciles**: re-running `/commit` (or archiving manually) cleans up the remainder — no git recovery needed.
5. If the failure is the `/watch-actions` invoke itself, the git work is already complete and safe — report it and tell the user to run `/watch-actions` manually (with `--repo <resolved-repo>` when the resolved repo isn't the cwd's repo).

## Safety Rules

**Never commit:**

- `.env` files or any file containing secrets/credentials
- API keys, tokens, private keys
- `node_modules/`, `vendor/`, build artifacts
- `specs/*.md` — specifications stay local; the implementation is the artifact
- `.tasks/` — implementation manifests stay local
- Generated docs, research notes, session markdown files
- Large binary files unless intentional

If a `specs/*.md` or `.tasks/` path appears in `git -C "$REPO_DIR" status` while preparing a commit, do not stage it under any flag — including `--all`. Warn the user and continue without it.

Never reference any planning-layer identifier (contract §6) in the commit message **or committed source**; scan before committing (Step 5; full rule in Step 4). The board↔git link is one-directional — the Step 9a SHA comment is the only exempt direction.

**Never push a deploy mainline directly while a worktree is active.** Best-effort, per the worktree reconciliation contract (and `docs/worktree-workflow.md` "direct-to-mainline … only when no worktree is active"): the Step 0.5 pre-commit gate hard-stops before committing onto an active-worktree mainline, and the Step 7-B deploy-mainline path re-checks immediately before its push and only ever pushes the **feature branch** (the mainline is reached via the PR merge, never a direct push). A single-operator residual race is accepted; there is no distributed lock.

**Never use** (forbidden by this skill even though `Bash(git -C:*)` would auto-approve the `git -C` form — the grant's breadth is backstopped by this list + the pre_tool_use hook, not by allowed-tools narrowness):

- `git add -A` or `git add .` in default mode (stage specific files by name)
- `git push --force` (also blocked by the pre_tool_use hook)
- `git reset --hard` on shared branches
- `git clean -f`, or a bare `git restore <file>` that discards uncommitted edits (only `git restore --staged <file>` is allowed)
- `--no-verify` to skip hooks

All of the above apply equally to their retargeted `git -C "$REPO_DIR" …` forms.

**If pre-commit hooks fail:**

1. Read the hook output carefully
2. Fix the issues in the code
3. Stage the fixes by name
4. Create a NEW commit (never amend to work around hook failures)

## Gotchas

- The pre_tool_use hook blocks `git push --force` and recursive `rm` but does **not** inspect `git add` paths — the never-stage table is enforced only by you reading it. Check `git -C "$REPO_DIR" diff --cached --name-only` against the safety patterns before committing.
- **Keep the `git -C "$REPO_DIR"` prefix on every git op** (Step 0) — a bare `git` operates on the cwd's repo, which may not be the resolved target. The `Bash(git -C:*)` grant pre-approves broad `git -C` forms (including a discarding `restore` / `reset --hard`); that breadth is constrained by the **Never use** list + the pre_tool_use hook, not by allowed-tools — honor the prohibitions explicitly, and unstage only with `git restore --staged <file>` (a bare `git restore <file>` silently discards edits).
- The Step 0 preflight matters because `git status`/`add`/`commit` **succeed mid-operation**: an in-progress rebase/merge/cherry-pick/revert won't error, so without the `$GIT_DIR`-marker probe a commit folds unrelated in-flight changes in.
- The harness requires a Co-Authored-By trailer at the end of commit messages; the templates above omit it — keep the trailer, don't strip it to match the examples.

## Error Handling

Board-resolution failures are handled at their steps per the contract: explicit-slug lookup-fails/zero-tasks and repo missing / not-a-git-tree / >1-repo (Step 0); multi-spec staged set and partial board read (Step 3); write-back failure (Step 9a). Git/staging scenarios:

| Scenario                                  | Action                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No changes to commit                      | Inform user, suggest checking `git -C "$REPO_DIR" status`                                        |
| Nothing staged (--staged mode)            | Warn and suggest staging files first                                                            |
| Sensitive file detected                   | Warn user, skip file, list what was excluded                                                    |
| Pre-commit hook fails                     | Fix issues, re-stage, create a new commit (never amend)                                          |
| Merge conflict markers found              | Warn user, do not commit, suggest resolution                                                    |
| In-progress rebase/merge/cherry-pick/revert | Step 0 preflight: stop before staging; tell user to finish/abort it, then re-run               |
| Deploy mainline + active worktree           | Step 0.5 pre-commit gate: hard-stop before staging; direct to a worktree                        |
| Worktree on a deploy-mainline repo          | Step 7-B.1: push feature branch + scoped PR + auto-merge (unless `--hold`); never push mainline |
| Worktree on a lower-branch repo, dirty tree | Step 7-B.2: refuse `wt merge`; commit/stash first, then re-run                                   |
| Worktree on a lower-branch repo, clean      | Step 7-B.2: `wt merge --stage none <lower>` (removes worktree), then push `<lower>` from primary |
| PR auto-merge unavailable                   | Step 7-B.1: leave PR open + retain worktree + report manual `gh pr merge --auto` steps           |

## Related Skills

- `/spec` → `/implement <slug>` produce and execute the board spec (`/implement` writes the `finalSummary` this skill reads for body context).
- `/review` reviews the uncommitted diff before committing; `/review-pr` opens a PR after. Both share this skill's board-awareness contract (`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`).
- `/watch-actions` is auto-invoked after a push (Step 9, or the Step 7-B worktree handoff) unless `--no-watch`; it can also run standalone to monitor HEAD's CI. In the worktree deploy-mainline path it is handed the **PR number** (`--pr`) so its cleanup tail can `wt remove` the worktree **only after the PR merges**.
- Worktree parallelism, the `wt` lifecycle, and the per-repo deploy/branch table this skill's reconciliation relies on are documented in `docs/worktree-workflow.md`; the reconciliation **contract** is codified in `backlog-conventions.md`.
