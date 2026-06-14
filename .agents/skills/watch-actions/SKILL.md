---
name: watch-actions
description: "Watch GitHub Actions runs (CI and deploys) for the locally-pushed commit. Use right after a push, or whenever the user asks whether CI/the build/the deploy passed, wants to wait for checks to go green, or asks to babysit a pipeline — even if they never say \"Actions\". Tracks all workflows triggered for HEAD's SHA, polls with cache-friendly adaptive cadence, surfaces per-job state changes, push-notifies on completion for watches over 3 minutes, and on red fetches and summarizes the relevant log slice with a proposed fix. When handed a worktree PR number (by /commit) with --repo, it adds a post-completion cleanup tail: after the run settles it bounded-polls the PR and, only once the PR has merged, offers a repo-scoped wt remove of the now-merged worktree."
allowed-tools:
  - PushNotification
  - Bash(gh repo view:*)
  - Bash(gh run list:*)
  - Bash(gh run view:*)
  - Bash(gh run watch:*)
  - Bash(gh pr list:*)
  - Bash(gh pr view:*)
  - Bash(gh pr checks:*)
  - Bash(wt list:*)
  - Bash(wt remove:*)
  - Bash(sleep:*)
argument-hint: "[--workflow <name.yml> | --run <id>] [--pr <number>] [--repo <path-or-name>]"
---

# Watch GitHub Actions Skill

Watch the workflow runs (CI and deploys) triggered by the most recently pushed commit on the current branch. Polls with cache-friendly adaptive cadence, surfaces per-job state changes, and on red produces a structured failure summary with a proposed fix. Stops at the first red but lists pending runs by name + URL so the user can decide whether to wait for the rest.

## Usage

- `/watch-actions` — Watch all runs whose `head_sha` matches local HEAD
- `/watch-actions --workflow ci.yml` — Only watch runs of a specific workflow
- `/watch-actions --run 12345678` — Only watch a specific run by ID
- `/watch-actions --repo <path-or-name>` — Retarget the entire skill to another repo instead of the current working directory (combinable with `--workflow` / `--run`)
- `/watch-actions --pr <number> --repo <path-or-name>` — After the watched run settles, run the **worktree cleanup tail** (Step 10): bounded-poll PR `<number>` and, only once it has **merged**, offer a repo-scoped `wt remove` of the now-merged worktree. This is the form `/commit` hands off after pushing a worktree feature branch and opening its auto-merge PR; `--pr` is meaningless without `--repo` (the cleanup is always scoped to the worktree's repo).

`--repo` accepts either a filesystem path or a bare repo name; a bare name resolves to `~/Repositories/YourVid/<name>` via the shared name→path convention (see **Step 0**). Without `--repo`, every git and filesystem operation resolves from the current working directory exactly as before — no change to existing invocations.

## Process

### 0. Resolve Repo Root

Determine the repo this invocation targets. **Every** git and filesystem operation in the steps below is scoped to this root — HEAD SHA, repo identity, branch lookup, and the `.github/workflows` reads alike.

- **No `--repo` (default):** the target is the current working directory. Set `REPO_DIR=.` and run all operations from cwd exactly as before. Skip the resolution below.
- **`--repo <path-or-name>` given:** resolve the value to a directory `REPO_DIR`:
  - A value containing a `/` (or starting with `.`, `~`, or `/`) is treated as a **path** — expand `~` and use it directly.
  - A bare **name** (no slash) resolves to `~/Repositories/YourVid/<name>` via the shared name→path convention. This is the **same** repo-name→path resolution `/commit` uses; do not reinvent it — see the `## Board awareness for /review, /commit, and /review-pr` section in `plugins/yourvid-tools/backlog-conventions.md`, the source of the shared convention.
  - **Validate** that `REPO_DIR` is a git working tree before proceeding:

    ```bash
    git -C "$REPO_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1
    ```

    If `REPO_DIR` does not exist or is not a git working tree, **stop with a clear error** and exit:

    > `--repo` target `<value>` resolved to `<REPO_DIR>`, which is not a git working tree. Pass a valid repo path or a name under `~/Repositories/YourVid/`.

**Convention for the rest of this skill:** prefix every git command with `git -C "$REPO_DIR"`, and read every workflow file under `"$REPO_DIR"/.github/workflows/`. With the default `REPO_DIR=.`, `git -C .` and `./.github/workflows/` are identical to the bare-cwd behavior — so the no-flag path is unchanged.

> **Why `--repo` exists:** the board-aware `/commit` can commit to a repo other than the session cwd; `--repo` lets it hand off its auto-watch to the correct repo so CI for that commit is tracked.

**Capture `--pr <number>` (optional).** If `--pr <number>` is present, record it as `$PR_NUMBER_HANDOFF` — the worktree PR `/commit` opened for a pushed feature branch. It does **not** change discovery or polling (Steps 1–9 are unchanged); it **only** arms the post-completion **worktree cleanup tail (Step 10)**. `--pr` is honoured **only together with `--repo`** (`REPO_DIR` ≠ `.`): the cleanup is always scoped to the worktree's repo via `wt -C "$REPO_DIR"`. If `--pr` is given **without** `--repo`, do not run the tail — note once that `--pr` requires `--repo` and otherwise behave exactly as a normal watch. Without `--pr`, `$PR_NUMBER_HANDOFF` is unset and Step 10 is a no-op. This is distinct from the **Step 3** PR *enrichment* lookup (which annotates required/optional checks for whatever PR happens to be open on the branch); `$PR_NUMBER_HANDOFF` is an explicit cleanup target handed off by `/commit`, used **only** by Step 10.

### 1. Resolve Target

**Read the local HEAD SHA** (of `REPO_DIR`):

```bash
HEAD_SHA=$(git -C "$REPO_DIR" rev-parse HEAD)
```

This is the canonical target. Only runs whose `head_sha` matches `$HEAD_SHA` will be tracked. Never fall back to "latest run on the branch" — that would pick up the wrong commit if the user pushed twice quickly.

**Resolve the repo identity** (works correctly inside a git worktree of a different remote, and for the `--repo` target):

```bash
REMOTE_URL=$(git -C "$REPO_DIR" remote get-url origin)
REPO=${REMOTE_URL#*github.com[:/]}
REPO=${REPO%.git}
```

If parsing fails (e.g., custom hostname, no `github.com` in URL), fall back to:

```bash
REPO=$(cd "$REPO_DIR" && gh repo view --json nameWithOwner --jq '.nameWithOwner')   # gh has no -C flag; run it in the target dir
```

`gh repo view` infers the repo from its working directory and has **no** `-C` flag, so when `--repo` is set the fallback runs gh inside the target dir via `cd "$REPO_DIR" && gh repo view …` (with the default `REPO_DIR=.` this is the plain `gh repo view`). That `cd …` form falls outside the `Bash(gh repo view:*)` grant, so on this rare non-GitHub-remote fallback it may prompt once.

`$REPO` is the GitHub `owner/repo` slug. Pass `--repo "$REPO"` to all subsequent `gh run` / `gh pr` calls (this is the `gh` *remote* selector and is independent of `--repo`'s local `REPO_DIR`).

**Discover initial runs:**

```bash
gh run list --repo "$REPO" --commit "$HEAD_SHA" --limit 50 \
  --json databaseId,headSha,status,conclusion,name,workflowName,createdAt,headBranch,event,url
```

`--commit` filters server-side — a client-side `--limit N` + jq filter can miss HEAD's runs entirely on a busy repo. The result is the **target set**. Already-completed runs count toward the target set — they are reported in the final summary without further polling.

**Argument handling:**

- `--workflow <name.yml>`: additionally filter the target set to runs whose `workflowName` matches the named workflow's `name:` field (read from `"$REPO_DIR"/.github/workflows/<name>.yml`); fall back to filename match if no `name:` declared. If the workflow file does not exist, list available workflows from `"$REPO_DIR"/.github/workflows/` and exit.
- `--run <id>`: target set is just that single run. Verify its `headSha` matches HEAD; if not, warn but proceed (the user explicitly chose this run).

### 2. Handle "No Runs Yet"

GitHub sometimes hasn't created the runs yet when invoked immediately after a push. If the target set is empty:

```bash
# Run the sleep ALONE as a background command (run_in_background: true),
# then re-list with the same query as Step 1 in a SEPARATE call when it completes.
sleep 30
```

If still empty, sleep another 30 s the same way and try once more. Total grace period is approximately 60 seconds (two retries of 30 s each). Each individual sleep stays well under the 270 s cache-window cap.

If still empty after the grace period, print:

> No runs found for `<SHA>` after 60s. Has the push reached origin? Did anything trigger?

Then exit cleanly (exit code 0). Do not loop further. (No run completed, so this is a **non-green** CI outcome for the cleanup tail: if a `--pr` handoff was present, enter **Step 10**, which makes no removal and notes that no CI run was observed; otherwise it is a plain no-op.)

### 3. PR Enrichment

Detect whether the current branch has an open PR. Use the explicit branch name (not `gh pr view`'s implicit "current branch" — which can resolve to the wrong PR in worktrees):

```bash
CURRENT_BRANCH=$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
PR_INFO=$(gh pr list --repo "$REPO" --head "$CURRENT_BRANCH" --state open \
  --json number,url --jq '.[0] // empty' 2>/dev/null)
```

If `$PR_INFO` is empty, no open PR exists for this branch — proceed without enrichment. No error.

If `$PR_INFO` is non-empty:

- Record the PR number (`$PR_NUMBER`) and URL from `$PR_INFO`
- Extract the set of required check names. **Note:** `statusCheckRollup` does **not** carry an `isRequired` flag; use `gh pr checks --required` instead:

  ```bash
  REQUIRED_CHECKS=$(gh pr checks "$PR_NUMBER" --repo "$REPO" --required \
    --json name --jq '[.[].name]' 2>/dev/null)
  ```

- Annotate each tracked run as `required` or `optional` based on whether its check name (`workflowName` or job name) appears in `$REQUIRED_CHECKS`

### 4. Initial Status Report

Print a compact table of all tracked runs:

```
Watching N runs for <SHA-short> on <branch>:

| Workflow         | Status      | Required | URL                                                           |
| ---------------- | ----------- | -------- | ------------------------------------------------------------- |
| ci.yml           | in_progress | yes      | https://github.com/<owner>/<repo>/actions/runs/<id>           |
| deploy.yml       | queued      | no       | https://github.com/<owner>/<repo>/actions/runs/<id>           |
```

Drop the `Required` column when no PR is detected. If all tracked runs are already completed at this point, no polling is needed: jump to **Step 7** if any conclusion is red (`failure` / `cancelled` / `timed_out` / `action_required`); otherwise jump to **Step 8**.

### 5. Adaptive Polling

Poll each in-flight run on each tick. The canonical per-run query:

```bash
gh run view <id> --repo "$REPO" --json status,conclusion,jobs \
  --jq '{status, conclusion, jobs: [.jobs[] | {name, status, conclusion, startedAt, completedAt}]}'
```

Job timing fields are camelCase (`startedAt` / `completedAt`) in `gh`'s JSON — snake_case variants silently return `null` and break duration reporting.

**Re-discover on each tick:** workflows chained via `workflow_run` (e.g. a deploy that fires when CI completes) are created minutes after the push and are invisible to the initial discovery. On each tick, re-run the Step 1 discovery command (`gh run list --repo "$REPO" --commit "$HEAD_SHA" …`) and add any new runs to the target set; never declare all-green without one final re-discovery.

**Cadence (adaptive):**

| Elapsed since invocation | Sleep between polls |
| ------------------------ | ------------------- |
| 0 – 3 min                | 30 s                |
| 3 – 10 min               | 60 s                |
| 10 min+                  | 270 s (cap)         |

No `sleep` invocation ever exceeds 270 seconds. The 270 s cap keeps each tick inside the 5-minute prompt-cache window.

**Never chain `sleep N && gh …` (or `sleep N; gh …`) in one foreground command** — the harness blocks foreground sleep and sleep-chained commands outright (23 recorded failures in real sessions came from exactly this pattern). Run the bare `sleep N` as a background command (`run_in_background: true`), yield, and issue the `gh` poll as its own call when the sleep completes. Where the harness offers a Monitor/wait primitive, prefer it over sleep entirely.

If `--json jobs` comes back empty for a run that was just created, the jobs simply haven't registered yet — treat it as still-starting and poll again next tick; do not report it as a failure (6 recorded "No job found" errors were this race).

**Maximum total wait:** 30 minutes (1800 seconds). On timeout, emit a status snapshot of in-progress vs completed runs (with URLs) and exit:

> Timed out after 30 minutes. Runs still in flight: `<list>`. URLs: `<urls>`.

A watch timeout is **not** a merged PR, so the cleanup tail performs **no removal**: fire the Step 9 notification, then enter **Step 10** with a non-green CI outcome (it records the no-removal reason and exits).

**Single-run optimization:** When tracking exactly one run, you may use `gh run watch <id> --exit-status --repo "$REPO"` as the polling primitive instead of manual sleep+poll. For multiple runs, poll each on the main tick — never block on any one `gh run watch`.

### 6. State-Change Reporting

After each poll, compare the new state to the previous tick. Emit a one-line update only when a job's state changes — workflow name, job name, transition, and elapsed time since invocation:

```
[+1m23s] ci.yml / lint: in_progress → completed (success)
[+2m07s] ci.yml / test: in_progress → completed (failure)
[+3m45s] deploy.yml / deploy: queued → in_progress
```

Do **not** emit "still running…" filler between state changes.

### 7. First-Red Handling

If any single tracked run finishes with conclusion ∈ {`failure`, `cancelled`, `timed_out`, `action_required`}:

1. Stop polling immediately
2. Fetch the failing job's log:

   ```bash
   gh run view <id> --repo "$REPO" --log-failed
   ```

3. Extract a relevant log slice (~10 lines): grep for `error|Error|FAIL|failed|Traceback|panic|assertion|expected|actual`, take ~3 lines of leading context and ~5 lines of trailing context around the first match. Do not dump the full log.
4. Identify the root cause from the slice: which file, which line, which check, what specifically failed.
5. Emit the failure summary in this shape:

   ```
   ❌ <workflow-name> failed (<conclusion>)

      Failed job: <job-name>
      Run URL:    https://github.com/<owner>/<repo>/actions/runs/<id>

      Cause: <one-paragraph natural-language summary, e.g. "Eslint failed on src/foo.ts:42 — unused import 'lodash'.">

      Log slice (relevant ~10 lines around the failing step):
          <line 1>
          <line 2>
          ...

      Proposed fix: <specific, actionable text — file path + line number when applicable, e.g. "Remove the unused lodash import in src/foo.ts:42, or invoke `npm run lint -- --fix`.">
   ```

6. List any pending runs by name + URL (do **not** wait for them):

   ```
   Still pending (not waited for):
   - deploy.yml — https://github.com/<owner>/<repo>/actions/runs/<id>
   ```

7. If elapsed > 3 minutes, fire `PushNotification` (see Step 9 for body format)
8. Do **not** apply the proposed fix; the user decides next steps. Behavior after the proposal is intentionally left open. Then enter **Step 10** with a **red** CI outcome: the cleanup tail makes **no worktree removal** on a red run — the failure summary above is the run's final word — so Step 10 only confirms "no removal (CI red)" when a `--pr` handoff was present, and is otherwise a silent no-op. Then exit.

### 8. All-Green Report

When every tracked run completes successfully, emit a compact summary:

```
✅ All green

| Workflow         | Conclusion | Duration | URL                                                           |
| ---------------- | ---------- | -------- | ------------------------------------------------------------- |
| ci.yml           | success    | 2m18s    | https://github.com/<owner>/<repo>/actions/runs/<id>           |
| deploy.yml       | success    | 4m02s    | https://github.com/<owner>/<repo>/actions/runs/<id>           |
```

For more than 10 runs, truncate the table to the first 10 rows with a `+N more` indicator.

When PR enrichment is active and all required checks are green even though some optional ones are still pending or red, note:

> All required checks green. Optional pending: `<list>`. Optional red: `<list>`.

This is the **all-green** terminal path. After the Step 9 notification, proceed to **Step 10** with a **green** CI outcome — the only outcome on which the cleanup tail polls the PR and may offer a removal.

### 9. Push Notification

If the wall-clock duration of the monitoring session exceeded 3 minutes (180 seconds), fire a `PushNotification` on completion (whether green, red, or timed out):

- **Body:** `<result> for <repo> on <branch>` where `<result>` is `all green`, `red: <workflow-name>`, or `timed out`
- The notification fires once at the end; do not send progress notifications

For sessions ≤ 3 minutes, no notification is sent.

### 10. Worktree Cleanup Tail (post-completion)

A **purely additive** post-completion tail. It runs **after** the watch has reached a terminal state and the Step 9 notification (if any) has fired, on **every** terminal path (all-green, first-red, watch-timeout, no-runs). It **only ever offers a worktree removal** — it never commits, pushes, merges, edits files, or changes any of the existing Steps 1–9 output, and it **never fails the watch**. The watch result already reported above stands regardless of what happens here.

This tail exists for the `/commit` worktree-landing handoff: after `/commit` pushes a worktree feature branch and opens its (auto-merge) PR, it hands that PR number here so that — once the PR actually merges — the now-redundant worktree can be cleaned up. The contract for scoping `wt`/`gh` to a repo via `-C` / `--repo`, and for the worktree-reconciliation lifecycle this tail closes, is **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (the same shared repo-name→path convention Step 0 resolves with); follow it, do not restate it.

#### 10.0 Entry gates (when the tail does anything at all)

Evaluate, in order — the **first** gate that fails makes the tail a no-op (or a one-line note) and ends the skill:

1. **No `--pr` handoff** (`$PR_NUMBER_HANDOFF` unset) → **no-op**, silently. This is the normal `/watch-actions` invocation and the **lower-branch landing path** (where `/commit` used `wt merge`, which already removed the worktree — there is nothing to clean up).
2. **`--pr` given without `--repo`** (`REPO_DIR` = `.`) → emit one line — *"`--pr` requires `--repo` to scope the worktree cleanup; skipping the cleanup tail."* — and end. (The cleanup is always scoped to the worktree's repo; an unscoped `wt remove` against the session cwd is never correct here.)
3. **CI outcome was not all-green** (the watch ended red, timed out, or found no runs) → make **no removal**. Emit one line — *"PR #`<n>`: leaving the worktree in place (CI did not pass: `<red|timed-out|no-runs>`)."* — and end. A failed/aborted build means the branch is **not** going to merge cleanly, so its worktree stays for the operator to fix and re-run.

Only when **all** of the above pass — a `--pr` handoff **and** `--repo` **and** an all-green CI outcome — does the tail proceed to poll the PR (10.1). This green-only precondition is what keeps a red run on its existing failure-summary path with no removal.

#### 10.1 Bounded poll of the handed-off PR's state

Query the PR's merge state, scoped to the GitHub remote `$REPO` (resolved in Step 1), by its explicit number — **not** `gh pr view`'s implicit current-branch resolution (which misfires in worktrees):

```bash
gh pr view "$PR_NUMBER_HANDOFF" --repo "$REPO" \
  --json number,state,merged,mergedAt,headRefName,baseRefName \
  --jq '{number, state, merged, headRefName}'
```

`state` is one of `OPEN` / `MERGED` / `CLOSED`; `merged` is the authoritative boolean (a closed-unmerged PR is `state=CLOSED, merged=false`; a merged PR is `state=MERGED, merged=true`). Capture `headRefName` — the PR's branch — as `$PR_BRANCH`; it is the worktree branch the tail may remove (do **not** trust a branch name from elsewhere).

**Why poll, not read once:** `/commit` enabled **auto-merge-on-green**, so at the instant CI goes green the merge has been *authorized* but GitHub may not have *completed* it yet — an immediate single read can still show `OPEN`. Poll on a **bounded** schedule:

- Poll up to **6 times** with a **30 s** sleep between attempts (≈ 3 minutes total). Run each `sleep 30` as its **own** background command (`run_in_background: true`) and issue the next `gh pr view` as a separate call when it completes — **never** chain `sleep 30 && gh …` (the harness blocks foreground/chained sleep, exactly as Step 5 warns). Each sleep stays well under the 270 s cache cap.
- **Stop early** the moment `merged == true` (→ 10.2 `MERGED`) or the moment `state == CLOSED && merged == false` (→ closed-unmerged outcome) — both are terminal; do not keep polling.
- If still `OPEN` after all 6 attempts → the **poll-timeout** outcome.

**Outcomes (all five defined):**

| Polled PR state | Outcome | Action |
| --- | --- | --- |
| `MERGED` (`merged == true`) | **merged** | Proceed to **10.2** — verify the worktree, then offer `wt remove`. |
| `OPEN` after the bounded poll | **poll-timeout** | **No removal.** Report: *"PR #`<n>` is green but not merged yet (auto-merge may still be settling, or merge is blocked). Worktree left in place; re-run `/watch-actions --pr <n> --repo <repo>` once it merges, or `wt -C <repo> remove <branch>` by hand after confirming the merge."* End. |
| `OPEN` and **never** merging (still open, no auto-merge) | **open** (same as poll-timeout) | Treated identically to poll-timeout: **no removal**, same report. An un-merged open PR is not a cleanup signal. |
| `CLOSED && merged == false` | **closed-unmerged** | **No removal.** Report: *"PR #`<n>` was closed without merging — the branch did not land. Leaving the worktree in place so its work isn't lost; remove it deliberately with `wt -C <repo> remove <branch>` (`-D` to discard the unmerged branch) if you're abandoning it."* End. |
| `gh pr view` errors / unparseable JSON | **failed-query** | Retry **once** after 5 s (consistent with the skill's network-failure policy). On a second failure: **no removal.** Report: *"Couldn't read PR #`<n>` state (`<error>`); not touching the worktree. Re-run the cleanup, or remove it by hand once you've confirmed the merge."* End. |

In **every** non-`MERGED` outcome the worktree is **left in place** — removal happens **only** on a confirmed merge.

#### 10.2 On MERGED — verify, then offer the scoped removal

Reaching here means the PR is **merged**. Before offering anything, **verify `$PR_BRANCH` actually maps to a linked worktree of `$REPO_DIR`** — never offer to remove a branch that isn't a checked-out worktree of this repo (it may already have been cleaned up, or may be the primary checkout):

```bash
git -C "$REPO_DIR" worktree list --porcelain
```

In the porcelain output each worktree is a `worktree <path>` line followed by its `HEAD <sha>` and a `branch refs/heads/<name>` line (a detached entry has `detached` instead). `$PR_BRANCH` **maps to a linked worktree** when some entry's `branch` is `refs/heads/$PR_BRANCH` **and** that entry's `<path>` is **not** the repo's main working tree (the first entry / the primary checkout). Decide from this:

- **A linked worktree for `$PR_BRANCH` exists** → make the offer below.
- **No worktree for `$PR_BRANCH`** (already removed, e.g. a prior run or a manual `wt remove`) → **no-op**; report: *"PR #`<n>` merged; its worktree for `<branch>` is already gone — nothing to clean up."* End.
- **`$PR_BRANCH` resolves to the primary checkout** (not a *linked* worktree) → **do not offer removal** (removing the main checkout is never right); report that the merged branch is the primary checkout and end.

When a linked worktree is confirmed, **offer** (do not auto-run) the repo-scoped removal — the operator confirms:

```bash
wt -C "$REPO_DIR" remove "$PR_BRANCH"
```

Frame it: *"PR #`<n>` merged into `<base>`. Its worktree for `<branch>` is now redundant — remove it? `wt -C <repo> remove <branch>`"*. Notes to include with the offer:

- `wt remove` **refuses a dirty worktree** and **keeps an unmerged branch**; since the PR merged, the branch is merge-equivalent and `wt` will delete it cleanly. If the worktree has **uncommitted/untracked** changes `wt` will refuse it (it does **not** force) — surface that refusal verbatim and let the operator decide (`-f` to force is **theirs** to run, never auto-applied here).
- The removal is **scoped to `$REPO_DIR`** via `wt -C` and only ever targets the **verified linked worktree** for `$PR_BRANCH` — it can't touch another repo or the primary checkout.

After the offer (whether the operator accepts, declines, or `wt remove` reports a refusal), the tail is done — report the result in one line and end. Declining is a perfectly valid outcome; nothing is forced.

## Edge Cases

| Scenario                                              | Behavior                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `gh` not installed or not authenticated               | The first `gh` call fails clearly; user re-installs / re-authenticates and re-invokes |
| No runs after the 60 s grace period                   | Print "No runs found for `<SHA>`" and exit cleanly                                    |
| All runs already completed when invoked               | Skip Step 5; print final summary directly                                             |
| Some runs red, others still pending                   | Stop on first red, summarize per Step 7, list pending by name + URL                   |
| User pushed twice (HEAD-SHA mismatches latest run)    | Use HEAD's SHA; ignore runs for the older SHA                                         |
| Worktree of a different repo                          | `git -C "$REPO_DIR" remote get-url origin` resolves correctly; `--repo "$REPO"` passed to all `gh` calls |
| `--repo <name-or-path>` given                         | Resolve to `REPO_DIR` (Step 0); scope every git (`git -C`) and `.github/workflows` read to it |
| `--repo` target missing / not a git working tree      | Stop with a clear error (Step 0); do not fall back to cwd                              |
| PR with required + optional checks                    | Annotate runs as required/optional; "all required green" message when applicable      |
| No PR for current branch                              | Skip enrichment, no error                                                             |
| Wait > 3 min                                          | Push notification fires on completion                                                 |
| Wait > 30 min                                         | Timeout snapshot + exit                                                               |
| Failed `gh` call (network, rate limit)                | Retry once after 5 s; if still failing, report and exit                               |
| `--pr <n> --repo <r>`, CI green, PR **merged**        | Step 10: verify `<branch>` is a linked worktree of `<r>`, then **offer** `wt -C <r> remove <branch>` (operator confirms) |
| `--pr <n>`, CI **red** / timed-out / no-runs          | Step 10: **no removal**; one-line "leaving the worktree in place (CI did not pass)" |
| `--pr <n>`, CI green, PR still **OPEN** after bounded poll | Step 10 poll-timeout: **no removal**; suggest re-running once it merges               |
| `--pr <n>`, CI green, PR **closed unmerged**          | Step 10: **no removal**; branch didn't land — worktree kept so work isn't lost        |
| `--pr <n>`, CI green, but the worktree for `<branch>` is already gone | Step 10: **no-op**; "worktree already gone — nothing to clean up"          |
| `gh pr view <n>` fails in the tail                    | Step 10 failed-query: retry once after 5 s; on second failure **no removal** + report |
| `--pr` given **without** `--repo`                     | Step 10: one-line "`--pr` requires `--repo`"; no cleanup (cleanup is repo-scoped)     |
| No `--pr` handoff (normal watch / lower-branch landing)| Step 10 is a no-op                                                                    |

## Error Handling

| Scenario                              | Action                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| `git -C "$REPO_DIR" remote get-url origin` fails | Fall back to `(cd "$REPO_DIR" && gh repo view --json nameWithOwner --jq '.nameWithOwner')` — gh has no -C flag |
| `--repo` value can't be resolved to a git working tree | Stop with the Step 0 error (state the value + resolved path); do not fall back to cwd |
| `gh run list` returns malformed JSON  | Report and exit with the raw error                                  |
| `gh run view --log-failed` empty      | Note "no failure log available"; still emit cause + URL summary     |
| `--run <id>` SHA doesn't match HEAD   | Warn but proceed (user explicitly chose this run)                   |
| `--workflow <name>` not found         | List available workflows from `"$REPO_DIR"/.github/workflows/` and exit |
| Network failure mid-poll              | Retry the failed call once after 5 s; on second failure report+exit |
| Step 10 `gh pr view <pr>` fails       | Retry once after 5 s; on second failure make **no removal**, report the read failure + PR number, end (the watch result already reported stands) |
| Step 10 `git -C "$REPO_DIR" worktree list` fails | Make **no removal**; report that the worktree state couldn't be verified and end |
| Step 10 `wt remove` refuses (dirty worktree) | Surface `wt`'s refusal verbatim; do **not** auto-`-f`; leave it to the operator |

## Related Skills

- Use `/commit` to create the commit — it offers push, multi-branch sync, and a chained `/watch-actions` invocation; when it commits to a repo other than the session cwd, it passes `--repo` so the auto-watch tracks CI for the correct repo. On the **worktree-landing** path (a pushed feature branch + its auto-merge PR), `/commit` additionally hands off the **PR number** (`--pr <number> --repo <repo>`) so this skill's **Step 10 cleanup tail** can offer a `wt remove` once that PR merges
- After a red, fix the issue, re-`/commit`, push, and re-invoke `/watch-actions` to verify the new commit
- For PR-driven workflows, pair with `/review-pr` (which creates the PR and triggers bot reviews); `/watch-actions` covers the CI/CD dimension separately
- The worktree-reconciliation lifecycle this tail closes (deploy-mainline PR + auto-merge, lower-branch `wt merge`, and this post-merge cleanup) is codified in `plugins/yourvid-tools/backlog-conventions.md`; the `wt`/`gh` `-C`/`--repo` scoping rules live there too
