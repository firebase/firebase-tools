---
name: review-pr
description: "Create a draft PR from the current branch with board-sourced spec traceability (FR#-AC# requirements table + AC checklist + task status pulled from the central Backlog board), then run a multi-select set of bot reviewers (Codex, Copilot, CodeRabbit — all opt-in) concurrently and fix identified issues, leaving fixes uncommitted for user review. Board-aware: takes an optional spec slug (or auto-detects one from the PR diff against the board) to build the PR body from that spec's board document + tasks, and records the created/selected PR's URL+number back onto the board; with no resolvable spec it falls back to a plain commit-analysis PR body. Use when the user wants to open/create a PR or get bot reviews on a pushed branch — trigger phrases include \"create a PR\", \"open a pull request\", \"PR this\", \"run the bot reviewers\". For local pre-PR diff review use /review instead."
allowed-tools:
  - Bash(gh auth:*)
  - Bash(gh pr:*)
  - Bash(gh api:*)
  - Bash(gh copilot-review:*)
  - Bash(git diff:*)
  - Bash(git branch:*)
  - Edit
  - mcp__backlog__task_list
  - mcp__backlog__milestone_list
  - mcp__backlog__task_view
  - mcp__backlog__document_search
  - mcp__backlog__document_view
  - mcp__backlog__task_edit
argument-hint: "[<slug>] [--source <branch>] [--target <branch>] [--no-fix]"
context: fork
---

# PR Review Automation Skill

Create a draft PR, then run a multi-select picker for bot reviewers (Codex, Copilot, CodeRabbit — all opt-in). Selected reviewers run concurrently against the PR; per-reviewer findings are rendered in their own sections, identified issues are fixed, and comments are resolved. Links the PR to its spec's requirements **from the central Backlog board** when one resolves. Changes are left uncommitted for user to review before committing.

**Board-aware (additive).** When a spec is resolved **from the board** (step 2), `/review-pr` builds the PR body's spec/AC/task traceability from that spec's board **document** and the resolved tasks' `acceptanceCriteria` + `finalSummary` (step 4), and after the PR is created (or an existing one selected) it records that PR's URL+number back onto the board (step 4a). Spec resolution, target-repo resolution, the **`/review-pr`-is-cwd-bound** rule, degradation, write-back (mechanism + destination matrix + idempotency + the PR-record's PR-identity fingerprint + non-fatal-write-back), and the no-planning-layer-references rule are all governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (the shared contract); this skill **cites** that contract and does not restate its rules. With no resolvable spec, board awareness adds nothing — `/review-pr` creates the same plain commit-analysis PR it always has, and the bot-reviewer orchestration is unchanged either way.

A PR body is **GitHub PR-UI metadata, not committed source** — so per the contract's Section 6 the planning-layer-reference rule **exempts the PR description**: the `FR#-AC#` requirements table, the AC checklist, and the board document/task references the skill injects into the PR body are *intentional* traceability there. That exemption covers **only** the PR body; any source line the fix-application loop edits remains fully bound by the rule (step 9's no-refs gate).

## Usage

- `/review-pr` - Create PR from current branch to auto-detected target, then pick reviewers; auto-detects the spec from the **PR diff** against the board (step 2)
- `/review-pr <slug>` - Bind to the named spec on the board; that spec's board document + tasks supply the PR body's traceability and resolve the target repo (which must be the cwd's repo — see step 2). An **explicit** slug is **fail-closed**: if its board lookup fails / matches zero tasks, or its resolved repo isn't the cwd's repo, `/review-pr` **stops** (per the contract) rather than degrading
- `/review-pr --source staging --target master` - Specify branches
- `/review-pr --no-fix` - Collect reviews but don't auto-fix

The optional `<slug>` is the first positional argument and combines with any flag: `/review-pr my-feature-slug --source staging --no-fix`.

## Gotchas

- **GraphQL:** inline values into the query string — parameterized variables (`query($var: Type!)` with `-f var=`) hit `$`-parsing errors in this flow (steps 7, 9).
- **Codex prompt:** no backtick and no `$(` anywhere in the Agent prompt — the auto-approve hook (`auto-approve-codex-coderabbit.sh:26-28`) silently falls through and the subagent's only Bash call dies on permissions (step 5a). Probe Codex via the `codex:codex-rescue` agent type, never the user-only `/codex:adversarial-review`.
- **Resolve threads last:** only after fixes are validated and the user has seen the resolution list (step 9) — a thread resolved against an uncommitted fix is silently-dismissed feedback if the fix is later discarded.
- **The fix-loop edits committed source, which is NOT exempt** from the no-planning-refs rule even though the PR body *is* — strip planning-layer refs from every line the loop touches (step 9).

## Branch Detection

Auto-detect target branch based on source:

| Source Branch     | Target Branch             |
| ----------------- | ------------------------- |
| `staging`         | `master`                  |
| `dev` / `develop` | `main`                    |
| `feature/*`       | `staging` (or `dev`)      |
| `hotfix/*`        | `master` (or `main`)      |
| Other             | Repository default branch |

## Process

### 1. Verify Prerequisites

```bash
# Check gh is authenticated
gh auth status

# Check for uncommitted changes
git status --porcelain

# Check if branch is pushed
git log @{u}.. --oneline 2>/dev/null || echo "Branch not pushed"
```

### 2. Resolve the Spec and Target Repo from the Board

Spec context comes from the **central Backlog board**, not from `specs/*.md` / `.tasks/` files. The mechanics here — spec resolution (explicit vs. bare), target-repo resolution, the cwd-bound rule, and degradation — are defined in **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`**. That section is the **single source of truth** shared with `/review` and `/commit`; this step **cites** it and follows it exactly. Do **not** restate or fork its algorithm, and do **not** introduce file-based detection — there is none: "no spec" means "no board context," never "scan files" (no branch-name → `specs/*.md` / `.tasks/<spec-id>/` lookup, no "Affected Components"/"Files owned" overlap heuristic).

**MCP availability (bare vs. explicit, per the contract's degradation rule):**

- **Bare call** (no `<slug>`): if the `backlog` MCP is unreachable, this is **not** a hard stop — drop straight to **spec-less** (a plain commit-analysis PR body, step 4) per the contract's degradation rule. The single auto-detect read described below is the *only* board read a bare run makes; a spec-less run never re-reads and never writes.
- **Explicit call** (`/review-pr <slug>`): an explicit request is **fail-closed** — if the `backlog` MCP is unreachable (or the lookup can't prove completeness), **report the cause and stop**. Do not degrade an explicitly named spec to spec-less.

#### 2a. Resolve the spec (hybrid — contract §1)

Resolve per the contract's **Spec resolution** (§1). `/review-pr`'s specialization is the scope of "changed files" for the bare auto-detect: the **PR diff**, not the working tree — the files in `git diff <target>...<source>` (the commits the PR would contain; contract §1):

```bash
git diff <target>...<source> --name-only   # PR-diff scope, NOT the working tree
```

- **Explicit `<slug>`** → `task_list milestone=<slug>` (slug = milestone title), paged to provable completeness; **fail closed** on lookup failure or zero tasks — never degrade an explicit slug to spec-less.
- **Bare** → one exhaustive read; auto-detect by overlap of those PR-diff files against tasks' `modifiedFiles` (compared as full `<repo>/<path>`), grouped by `milestone` (status-agnostic — a fully-`Done` spec still matches). Single clear winner → select + **announce** (an explicit slug overrides); **tie, zero overlap, or unprovable completeness → spec-less**. A task with malformed `milestone` is excluded + reported; if that flips the outcome, degrade to spec-less naming it.

#### 2b. Resolve the target repo and apply the cwd-bound rule (per the contract's "Target-repo resolution" + "Execution scope")

Once a spec is resolved, take its **target repo** from the resolved tasks' `modifiedFiles` `<repo>/` prefix (per the contract — the canonical source; the `repo:<name>` label is now set on every executable task too but `modifiedFiles` stays primary), and validate `~/Repositories/YourVid/<name>` is a git working tree.

`/review-pr` is **cwd-bound** (every `gh pr create`/`gh pr edit`, the bot triggers, the GraphQL review-thread polling, and the fix-application run all execute against the current working directory's repo and are **not** safely retargetable). Therefore:

- **Cwd mismatch → fail closed.** Resolve the spec's repo set from the resolved tasks' `modifiedFiles` `<repo>/` prefixes. A **single-repo** spec whose repo ≠ the cwd's repo, **or** a **cross-repo** spec **none** of whose repos is the cwd's repo: **fail closed** — do **not** retarget. Stop with `this spec targets <repo(s)>; cd into <repo> and re-run`, naming the candidate repo(s).
- **Cross-repo spec that *includes* the cwd's repo → scope to cwd, don't fail** (contract §2). Select the **cwd-repo partition** of executable tasks and operate on it; the coordination parent is excluded from that set but its id is **retained** as the cross-repo write-back destination (step 4a). Spanning more than one repo is **not** itself a failure — only "cwd is none of the spec's repos" is.
- **Other contract target-repo failures** (the resolved repo path missing, or not a git working tree) fail closed the same way — name the specific problem and stop.
- **Bare auto-detect can never hit a cwd mismatch** — it matched the cwd's own PR diff (step 2a), so the cwd repo is one of the spec's repos by construction. (A bare-call target-repo failure — missing path / not a git tree / no executable task for the cwd repo after scoping — degrades to spec-less, not a halt.)

**Validate the resolved tasks' `modifiedFiles` (contract §1 / §2 well-formedness).** For every resolved task (the cwd-scoped executable set), its `modifiedFiles` must be **non-empty** and every entry must be a **well-formed `<repo>/<path>`** (a repo segment plus a path), all naming the **cwd repo** — which holds by construction of the cwd-repo partition, so what counts as malformed is a single task whose *own* entries straddle two repos (not a cross-repo *spec*, which is scoped above). If any resolved task's `modifiedFiles` is empty or malformed (missing the `<repo>/` segment, or one task's entries name more than one repo): an **explicit** slug **fails closed naming the offending task(s)**; a **bare** auto-detect drops to **spec-less** (the malformed task can't be trusted to source a body).

**"The resolved tasks"** throughout means the executable tasks of the resolved spec **scoped to the cwd repo**, with the cross-repo coordination parent excluded (its id is **retained** as the cross-repo write-back destination — step 4a). **If that scoped set is empty** — the only cwd-repo task is the coordination parent, or no executable task targets the cwd repo at all — there is no body source and no per-repo write target: an **explicit** slug **fails closed** (report that the spec has no executable task for the cwd repo); a **bare** call drops to **spec-less**.

#### 2c. Outcome — what step 4 / 4a receive

| Resolution outcome | Step 4 (PR body) | Step 4a (PR record) |
| --- | --- | --- |
| **Spec resolved** | body's spec/AC/task section built from the board (step 4) | PR record appended to the destination task |
| **Spec-less** (any bare degradation — tie/zero overlap, MCP-unreachable, unprovable completeness, target-repo failure, empty cwd-scoped set, or malformed `modifiedFiles`) | plain commit-analysis body (step 4, "PR body without spec") | **no** board reads-after-failure, **no** board writes — no PR record |
| **Explicit-slug failure** (lookup fails / zero tasks / cwd is none of the spec's repos / no cwd-repo executable task / malformed `modifiedFiles`) | — **stop** (fail closed); no PR created | — |

A spec-less run has performed **exactly one** attempt-read (the bare auto-detect, or the failed MCP probe) and makes **no further board reads** and **no board writes** thereafter — the file-based detection is **not** resurrected to manufacture a body or a write target (contract §4).

### 3. Check for Existing PR

```bash
gh pr list --head $(git branch --show-current) --json number,url
```

**If PR exists:** Ask user whether to:

- **Re-trigger reviews** on the existing PR (useful after pushing fixes)
- **Create a new PR** (if the existing one was closed or is stale) — **proceed to step 4** to create a fresh draft PR exactly as the no-existing-PR path (then step 4a, then step 5)

**On re-trigger (select the existing PR — contract §5):** adopt the existing PR for this branch rather than creating a new one. When a spec resolved (step 2), **update its body** with the board traceability via `gh pr edit`, building the same body step 4 would (step 4's "PR body with spec", subject to the same size budget):

```bash
gh pr edit <existing-PR-number> --body "$(cat <<'EOF'
<board-sourced body — identical construction to step 4's "with spec" body>
EOF
)"
```

If `gh pr edit` **fails** (network, permissions, etc.), **warn and proceed** — do not abort; the PR still exists and its record (step 4a) still gets written. A spec-less re-trigger leaves the existing body untouched (no board context to inject).

Selecting the existing PR is a "PR selected" event for write-back purposes: after the body update (or its skip), run **step 4a** to record the PR identity on the board (idempotent by PR identity, so re-triggers never duplicate the record), then continue to step 5 (Pick Reviewers) using the existing PR number — the multi-select runs every invocation, including re-triggers.

### 4. Create Draft PR

Generate title from commits:

```bash
git log <target>..<source> --oneline --no-merges
```

The PR body has two shapes, decided by step 2's outcome: **without spec** (spec-less) and **with spec** (a spec resolved from the board). The PR body is **GitHub PR-UI metadata, exempt from the no-planning-refs rule** (contract §6) — so the `FR#-AC#` requirements table and the AC checklist below are *intentional* there.

**Mechanism — always `--body-file`, never an inline `--body` heredoc.** Assemble the chosen body, write it to a temp file (`BODY_FILE=$(mktemp)`, written via the **Write** tool), and pass `--body-file "$BODY_FILE"` to **every** `gh pr create` / `gh pr edit` in this step and in step 3. The `--body "$(cat <<'EOF' … EOF)"` forms shown below illustrate the body **content only** — do **not** run them literally: board-sourced content containing a line that is exactly `EOF` (or shell metacharacters, or a body near the size limit) would break a heredoc, whereas `--body-file` carries arbitrary content safely.

**PR body without spec** (spec-less — bare tie/zero overlap, bare MCP-unreachable, or bare malformed-`modifiedFiles`; **no** board reads):

```bash
gh pr create \
  --base <target> \
  --head <source> \
  --draft \
  --title "<generated title>" \
  --body "$(cat <<'EOF'
## Summary

<bullet points from commit analysis>

## Test Plan

- [ ] Automated review feedback addressed
- [ ] Manual testing completed

Generated with Claude Code
EOF
)"
```

**PR body with spec — sourced from the board** (step 2 resolved a slug):

Build the spec/AC/task section **from the board** (no file read — there is no `specs/*.md` or `.tasks/SUMMARY.md` scan):

1. **The spec document (overview).** Find the board document tied to the resolved slug by **exact `slug:` match**: `mcp__backlog__document_search` for the slug, then `mcp__backlog__document_view` the match for the feature's overview/motivation. On **zero or multiple** matches, **warn and fall back** to the resolved tasks' `finalSummary` for the overview text — **never block** the PR on a missing/ambiguous document. The document overview is **spec-global** (it describes the whole feature, possibly across repos), so **label it as such** in the body; it is not scoped to the resolved repo.
2. **The resolved tasks (ACs + what shipped).** For each resolved task (the executable tasks scoped to the one resolved repo, coordination parent excluded — step 2b), `mcp__backlog__task_view` it and read its `acceptanceCriteria` (each already `FR#-AC#`-prefixed on the board) and its prose `finalSummary` (what shipped). These source the requirements table, the AC checklist, and the per-task status — all **scoped to the resolved repo's executable tasks**.
3. **Status — derived from the board, scoped to the resolved repo's executable tasks** (the board has no `superseded`/`cancelled` states, so there is nothing to omit on that basis):
   - **Requirement (FR#) status:** roll up its ACs — all the requirement's ACs checked on the board → ✅ Met; some unchecked → ⏳ pending.
   - **AC checklist:** a board-**checked** acceptance criterion → `[x]` (Met); **unchecked** → `[ ]` (pending).
   - **Task status:** the task's board status — `Done` / `In Progress` / `Specced`.

```bash
gh pr create \
  --base <target> \
  --head <source> \
  --draft \
  --title "<generated title>" \
  --body "$(cat <<'EOF'
## Summary

<bullet points from commit analysis>

## Spec Reference

<spec-global overview, from the board document (or, on a zero/ambiguous doc match, from the tasks' finalSummary — warn) — labelled as the whole-feature overview, not repo-scoped>

### Requirements Addressed *(scoped to this repo's tasks)*

<INCLUDE this FR#-AC# requirements table ONLY when the resolved tasks have ACs; omit entirely when they have none>

| Requirement | Status |
| ----------- | ------ |
| FR1: <name> | ✅ Met / ⏳ pending |
| FR2: <name> | ✅ Met / ⏳ pending |

### Acceptance Criteria *(scoped to this repo's tasks)*

<INCLUDE this per-AC checklist ONLY when the resolved tasks have ACs; omit entirely when they have none — each item's checked/unchecked state is read from the board>

- [x] FR1-AC1: <criterion>
- [x] FR1-AC2: <criterion>
- [ ] FR2-AC1: <criterion> *(pending on the board)*

### Implementation Tasks *(scoped to this repo's tasks)*

<one row per resolved executable task; status + finalSummary from the board>

| Task | Title | Status | Criteria Met |
| ---- | ----- | ------------ | ------------ |
| <title> | ... | Done / In Progress / Specced | <n>/<m> ACs checked |

<per-task one-line summary drawn from each task's finalSummary>

## Test Plan

- [ ] All acceptance criteria verified
- [ ] Automated review feedback addressed
- [ ] Manual testing completed

Generated with Claude Code
EOF
)"
```

**No ACs on the resolved tasks:** if the resolved tasks carry **no** acceptance criteria, **omit** both the requirements table and the AC checklist — the body still shows the spec-global overview and the per-task `finalSummary` summaries.

**Partial / malformed / timed-out board read while building the body (contract §5 — degrade, never block):** if the document read **or** any resolved task's `task_view` comes back **partial, malformed, or timed-out** *after* a spec already resolved, **name what couldn't load** (the document, or the specific tasks/criteria) and **warn**, but **STILL create the PR** — the body degrades to *whatever loaded* plus the commit analysis. This is **not** the spec-less path (a spec is in hand); it is a partial-board PR with the gaps called out.

**Size budget (~65,536-char GitHub limit).** The PR body must never make `gh pr create` (or `gh pr edit`) fail on body size. Emit the **required traceability first** — the requirements table, then the AC checklist — so it is never the thing truncated. If the assembled body would approach the limit, **truncate or omit the lower-priority sections** (the per-task `finalSummary` prose, then the spec-global overview) and append a `*(truncated — full traceability on the board)*` note where content was cut. The Summary + the FR#-AC# requirements table + the AC checklist take precedence over prose. **If the required traceability *alone* would approach the limit** (a spec with very many ACs), compact it deterministically too — keep each `FR#-AC#` ID and its ✅/⏳ status but drop the criterion prose, and if it is *still* over, truncate the AC checklist with the same `*(truncated — full traceability on the board)*` note — so `gh` never fails on body size even in that pathological case.

**Uncertain `gh pr create` outcome (contract §5 — reconcile, don't guess).** If the `gh pr create` call returns an **uncertain** result (timeout, ambiguous error, no parseable PR URL/number) so it's unclear whether the PR was created, **reconcile by querying open PRs by repo + head + base** rather than blindly retrying (a blind retry risks a duplicate PR):

```bash
gh pr list --base <target> --head <source> --state open --json number,url,headRefName,baseRefName
```

- **Exactly one** match → **adopt** it as the created PR and proceed to record it (step 4a).
- **Multiple** matches → **fail closed** (do not guess which is "the" PR); report the candidates and stop.
- **Zero** matches → the create did not land; it is safe to retry `gh pr create` once.

### 4a. Record the PR on the Board

Runs **after a PR is created (step 4) or an existing one is selected (step 3)** — "no PR ⇒ no record" (contract §5). This is governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (§5: write-back conventions); follow it, do not restate it.

**Gate — spec-less makes no record.** If step 2 resolved **no** spec (spec-less), there is **no** board destination: write **nothing**, make **no** board reads-after-failure. A PR record happens **only** when a spec resolved.

Otherwise append **one** comment via `mcp__backlog__task_edit commentsAppend` (**only** — never toggle an AC checkbox or task `status`; those belong to `/implement`, and there is **no** AC-verification pass here — `/review` owns that):

- **What & where:** the PR's **URL + number** → the §5 destination (single-repo → the resolved repo's lowest-numbered executable task per §5's comparator; cross-repo → the coordination parent whose id was retained in step 2b). One `commentsAppend`, not fanned out.
- **Idempotency keyed to PR identity (§5).** Unlike `/review`/`/commit`'s **per-run** fingerprint, this record's key is the **immutable PR identity** `<owner>/<repo>#<number>`. **Before** appending (and again on an uncertain outcome), re-read the destination task and **skip** if a comment bearing that identity exists — exactly **one** PR record per PR, however many times the skill runs (re-triggers, concurrent invocations).
- **Non-fatal (§5).** Recording **never fails the PR** — it already exists on GitHub. A write-back failure (definite error, failed re-read, or missing/ambiguous destination) is **reported, not raised**: surface the unrecorded PR identity + URL, note that a re-run reconciles by identity, and **continue** to step 5.

### 5. Pick Reviewers (multi-select)

`/review-pr` is bots-only — there is no mandatory reviewer. Prompt the user via `AskUserQuestion` (multi-select) with exactly three opt-in options:

| Option       | Trigger mechanism                                      | Plugin / extension required               |
| ------------ | ------------------------------------------------------ | ----------------------------------------- |
| `Codex`      | `Agent(subagent_type: codex:codex-rescue, run_in_background: true)` with FP2 prompt + PR-context block | `openai/codex-plugin-cc`                  |
| `Copilot`    | `gh copilot-review <PR_NUM>` extension                 | `gh-copilot-review` gh extension          |
| `CodeRabbit` | PR comment `@coderabbitai review`                      | CodeRabbit GitHub App enabled on the repo |

The multi-select is shown every invocation (no sticky preference). Show it after PR creation completes.

**Empty selection (no reviewers picked):**

If the user deselects all three options, warn and exit cleanly. The PR was already created in step 4 and is left as a draft for the user to handle manually:

> No reviewers selected. /review-pr needs at least one. Exiting.

Do not trigger any bots, do not poll, do not generate a summary. Exit with code 0.

**Plugin-missing halt (per selected reviewer):**

For each selected reviewer, verify the trigger dependency is available **before launching anything**. If a selection's plugin/extension is missing, halt the entire run with the exact remediation message — no reviewers are triggered on this invocation, even if other selections are installed:

| Selected     | Probe                                                                  | Halt message (verbatim)                                                                          |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Codex`      | The `codex:codex-rescue` agent type is available (listed among the Agent tool's agent types) or any `codex:*` skill (e.g. `codex:setup`) appears in the available-skills list. Do NOT probe for `/codex:adversarial-review` — it has `disable-model-invocation: true` upstream and is invisible to the model even when installed, so that check false-negatives | `Codex plugin is not installed. Install: /plugin marketplace add openai/codex-plugin-cc → /plugin install codex@openai-codex → /reload-plugins. Then re-invoke /review-pr.` |
| `Copilot`    | `gh extension list` does not contain `gh-copilot-review`               | `Copilot review extension is not installed. Run: gh extension install ChrisCarini/gh-copilot-review. Then re-invoke /review-pr.` |
| `CodeRabbit` | CodeRabbit GitHub App not installed on the repo (best-effort probe via `gh api`) | `CodeRabbit plugin is not installed. Run: /plugin install coderabbit. Then re-invoke /review-pr.` |

After the halt, the PR is left as-is (created in step 4); the user fixes the install and re-invokes `/review-pr`.

### 5a. Trigger Selected Reviewers (concurrently)

Launch every selected reviewer in parallel — do not wait for one before starting the next. Polling happens in step 6.

```bash
# Get PR number (still on the just-created or re-targeted PR)
PR_NUM=$(gh pr view --json number -q '.number')

# Resolve source branch and merge target for the PR-context block prepended to FP2
SOURCE_BRANCH=$(gh pr view "$PR_NUM" --json headRefName -q '.headRefName')
MERGE_TARGET=$(gh pr view "$PR_NUM" --json baseRefName -q '.baseRefName')
```

**Codex trigger** (only if `Codex` was selected) — spawn the `codex:codex-rescue` agent via the `Agent` tool with `subagent_type: "codex:codex-rescue"` and `run_in_background: true`. The Agent prompt has four parts in order: a `--wait` routing handle line, an explicit read-only directive sentence, the PR-context block, then the FP2 focus prompt verbatim.

**Pre-spawn validation**: before constructing the Agent prompt, validate that `<SOURCE_BRANCH>` and `<MERGE_TARGET>` contain neither a backtick character nor the `$(` substring. The validation must actually gate the Agent spawn — set a flag, then skip the Agent call on failure:

```bash
CODEX_OK=1
for v in "$SOURCE_BRANCH" "$MERGE_TARGET"; do
  case "$v" in
    *'`'*|*'$('*)
      echo "Codex: ⚠️ Failed: interpolated branch name contains hook-incompatible characters: $v"
      CODEX_OK=0
      ;;
  esac
done
```

If `CODEX_OK=0`, do NOT spawn the Codex Agent — mark it as failed for synthesis purposes and continue with other reviewers (per existing per-reviewer failure handling). If `CODEX_OK=1`, spawn the Agent:

```
Agent({
  subagent_type: "codex:codex-rescue",
  run_in_background: true,
  description: "Codex adversarial PR review",
  prompt: "--wait

This is a read-only review pass. Do not modify any files; only report findings.

## Review target

- Source branch: <SOURCE_BRANCH>
- Merge target: <MERGE_TARGET>
- Diff scope: <MERGE_TARGET>...<SOURCE_BRANCH>

<FP2 focus prompt — verbatim, see below>"
})
```

The `--wait` handle is recognized and stripped by the codex-rescue agent's `codex-cli-runtime` skill, forcing **foreground** `codex-companion.mjs task` (no `--background`) so the CLI runs synchronously in the subagent's single Bash call; its stdout returns verbatim and the Agent's completion notification delivers the review (no polling, no session-id tracking). The read-only directive selects the review-without-edits branch (skips `--write`); the sandbox defaults to `read-only` regardless. The PR-context block conveys the diff scope (GitHub three-dot compare) in prose, not via a `--base <target>` flag or a literal git command.

**Hook-compatibility:** the full prompt (wrapper + PR-context + FP2) must contain **no backtick and no `$(`** — the auto-approve hook (`auto-approve-codex-coderabbit.sh:26-28`) silently falls through on either; the pre-spawn validation covers interpolated branch names and FP2 is clean. **Routing/migration:** codex-rescue forwards through `codex-companion.mjs task`, not the dedicated `adversarial-review` backend (which is `disable-model-invocation` / user-only) — FP2 + the PR-context block carry the framing, so quality holds. When the plugin exposes a model-invocable adversarial-review entry point, swap to it (passing `--base <MERGE_TARGET>` natively) and drop the PR-context block, `--wait`, and read-only lines.

The focus prompt for this Codex call is **FP2** (verbatim — do not paraphrase, do not summarize, do not re-order):

```
You are reviewing the full diff of a pull request branch against its merge target. Read the diff cold, plus any affected files in full. This is a final-pass adversarial review before merge.

Focus on what a senior reviewer would catch on a final approval gate:

- Correctness regressions surfaced only by the integrated diff (not visible per-commit)
- Cross-file interactions: contracts that fit individually but break in combination
- Race conditions, transactional boundaries, partial-failure modes across the diff's surface area
- Security: new attack surface, regression in trust boundaries, secret leakage
- Operational concerns: error handling gaps, logging blind spots, monitoring coverage
- Resource management: leaks, unbounded growth, missing cleanup
- API / schema breaking changes that downstream consumers may depend on
- Migration safety, rollback paths, data integrity under concurrent writes

For each finding output:
  SEVERITY: Critical | Major | Minor | Trivial
  FILE:LINE: <path>:<line>
  ISSUE: one sentence
  SUGGESTED FIX: concrete change

Skip stylistic nits. If the diff is solid, say so plainly. Do not invent issues to seem thorough.
```

**Copilot trigger** (only if `Copilot` was selected):

```bash
gh copilot-review $PR_NUM
```

**CodeRabbit trigger** (only if `CodeRabbit` was selected):

```bash
gh pr comment $PR_NUM --body "@coderabbitai review"
```

All three triggers are issued back-to-back without intervening waits. Each reviewer then runs in its own pipeline; polling in step 6 is concurrent.

**Expected reviewers:**

| Reviewer       | Author Login (PR-comment bots) / Source       | Completion signal                                          |
| -------------- | --------------------------------------------- | ---------------------------------------------------------- |
| Codex          | local Codex CLI via codex-rescue Agent        | `Agent(run_in_background: true)` completion notification   |
| Copilot        | `copilot-pull-request-reviewer[bot]`          | PR review with body matching `## Pull request overview`    |
| CodeRabbit     | `coderabbitai[bot]`                           | PR review with body matching `**Actionable comments posted: X**` |

### 6. Wait for Reviews (concurrent — push for Codex, polling for GitHub bots)

Wait for all selected reviewers concurrently. Only the reviewers actually selected in step 5 are tracked.

**Codex completion** (only if `Codex` was selected) is delivered via push notification — `Agent(run_in_background: true)` fires when the codex-rescue subagent finishes. No polling, no session-id tracking.

**Copilot + CodeRabbit (GitHub-App) completion** (only if either was selected) requires polling the PR's review threads via `gh api`:

**Polling strategy (Copilot + CodeRabbit only):**

1. Initial wait: 120 seconds (CodeRabbit needs 3–8 minutes for large PRs; Copilot is faster)
2. Poll interval: 60 seconds (well under the 270 s prompt-cache cap, per the existing `/watch-actions` precedent)
3. **Maximum total wait: 15 minutes** — same cap as `/review`
4. Complete when every selected GitHub-App reviewer has reached `COMMENTED` or `failed` AND the Codex Agent (if selected) has fired its completion notification

```bash
# Copilot + CodeRabbit (only if either selected) — both surface as PR reviews
gh api repos/{owner}/{repo}/pulls/$PR_NUM/reviews \
  --jq '.[] | select(.state == "COMMENTED") | .user.login' | sort -u
# Expected logins (filter to those whose reviewer was selected):
#   coderabbitai[bot]
#   copilot-pull-request-reviewer[bot]
```

**One-line state-change updates:**

While polling, emit one line per reviewer **only when its status transitions** — no "still running" filler between transitions. Track elapsed time from the moment the trigger volley in step 5a fired:

```
[+0m12s] codex: in_progress
[+1m45s] copilot: completed
[+3m02s] coderabbit: completed
[+4m18s] codex: completed
```

**Per-reviewer failure handling:**

If an individual reviewer call fails — Codex session reports `failed`, the `gh copilot-review` extension errors out, the CodeRabbit comment receives a parse-failure response, network/rate-limit errors, malformed output — record the reviewer as failed with its reason and **continue polling the others**. Do not abort the whole run.

Each failed reviewer's section in step 10 (Generate Summary) shows `⚠️ Failed: <reason>`. The synthesis proceeds. The top-level verdict notes incomplete coverage (e.g., `Code quality: Ready (Codex coverage incomplete — Codex failed: timeout)`).

**15-minute cap timeout:**

If 15 minutes elapse before every selected reviewer has reached a terminal state, stop polling and surface a snapshot — list each reviewer with its last observed status (`completed`, `in_progress`, `failed`, `queued`) — then exit cleanly. Reviewers still `in_progress` are treated like `⚠️ Failed: timeout (15-min cap)` in the synthesis; the verdict notes incomplete coverage.

### 7. Collect Review Output

Collect output from each selected reviewer that completed. Codex output comes from the Agent's completion message; Copilot and CodeRabbit output comes from PR review threads.

**Codex** (if selected and Agent fired completion): the Agent's final message *is* the Codex review output (the codex-rescue subagent returned codex-companion stdout verbatim). Parse the structured findings (`SEVERITY` / `FILE:LINE` / `ISSUE` / `SUGGESTED FIX` blocks emitted by FP2) directly from the Agent's completion payload. Each finding belongs to the Codex section of the synthesis — do not interleave with the GitHub PR comment threads. No separate fetch step is needed.

**Copilot + CodeRabbit** (if selected and `COMMENTED`) — fetch via the GitHub GraphQL review-threads API. **Important:** Do NOT use GraphQL parameterized variables (`query($var: Type!)` with `-f var=`). The `$` signs cause parsing errors. Instead, inline values directly into the query string.

```bash
# Get repo owner, name, and PR number
OWNER=$(gh repo view --json owner -q '.owner.login')
REPO=$(gh repo view --json name -q '.name')
PR_NUM=$(gh pr view --json number -q '.number')

# Fetch review threads (inline values — do NOT use GraphQL variables)
gh api graphql -f query='query { repository(owner: "'"$OWNER"'", name: "'"$REPO"'") { pullRequest(number: '"$PR_NUM"') { reviewThreads(first: 100) { nodes { id isResolved path line comments(first: 10) { nodes { author { login } body } } } } } } }'
```

When parsing thread comments, attribute each thread to its bot via `comments.nodes[0].author.login` so the synthesis can render per-reviewer sections in step 10.

### 8. Categorize Issues

Categorize within each reviewer's section — findings are not deduplicated across reviewers. Cross-reviewer overlap is left as visual signal in the per-reviewer sections of step 10.

**Codex patterns** (most structured — FP2 dictates the output format):

| Severity | Pattern in finding block             |
| -------- | ------------------------------------ |
| Critical | `SEVERITY: Critical`                 |
| Major    | `SEVERITY: Major`                    |
| Minor    | `SEVERITY: Minor`                    |
| Trivial  | `SEVERITY: Trivial`                  |

**CodeRabbit patterns** (most structured):

| Severity | Pattern in Comment                     |
| -------- | -------------------------------------- |
| Critical | `_🛑 Security_` or `_🔴 Critical_`     |
| Major    | `_⚠️ Potential issue_` or `_🟠 Major_` |
| Minor    | `_⚠️ Potential issue_` or `_🟡 Minor_` |
| Trivial  | `_🧹 Nitpick_` or `_🔵 Trivial_`       |

**Copilot patterns** (less structured, use keywords):

| Severity | Keywords                                |
| -------- | --------------------------------------- |
| Critical | "security", "vulnerability", "critical" |
| Major    | "bug", "error", "issue"                 |
| Minor    | "consider", "suggestion", "might"       |

### 9. Fix Issues (unless --no-fix)

For each finding, by severity — Codex findings come from the Agent completion payload (no GitHub thread to resolve); Copilot/CodeRabbit findings come from review threads:

1. **Read the finding** - understand what's being flagged
2. **Read the file** - get surrounding context
3. **Verify the issue** - check if it's a real problem or false positive
4. **Apply fix** - use Edit tool

**Post-fix no-planning-refs gate (contract §6).** The PR body is exempt from the no-planning-refs rule, but **committed source is not** — and this loop edits committed source. After applying fixes (and before validation/thread-resolution), scan **the lines this loop actually edited** (its own `Edit`s, not a full-tree audit) for **planning-layer references** and **strip them**: board/task IDs, `spec:<slug>` slugs, board document or milestone names, `FR#-AC#` acceptance-criterion IDs, `T`-numbers, and spec/doc paths — in code comments, test names/docstrings, and module/class/function docstrings. A quick pattern probe over the edited files plus a read of the touched lines:

```bash
git diff -- <files-this-loop-edited> | grep -nEi 'specs?/|\.tasks/|spec:[a-z0-9-]+|FR[0-9]+-AC[0-9]+|TASK-[0-9]+(\.[0-9]+)?|\bT-?[0-9]+\b|task[ _-]?id' || true
```

If a fix introduced one (e.g. a comment that pasted an AC's `FR#-AC#` prefix from the board-sourced PR body into a code line), **rewrite that line to describe the behavior directly** (state what the code does, with no planning-layer token) and re-validate the changed file. The board↔git link is one-directional: the PR body and the board comment (step 4a) may carry planning refs, but **nothing in committed code may**. The rest of this loop is otherwise unchanged.

After all fixes are applied: validate them — run the project's test/build command if one exists, otherwise re-read the full diff for regressions. Then show the user the list of threads about to be resolved, and only after that resolve each fixed thread (a thread resolved while its fix is still uncommitted silently dismisses reviewer feedback if the fix is later discarded):

```bash
# Replace THREAD_ID with the actual thread ID from step 7
# Important: Inline the thread ID directly — do NOT use GraphQL variables
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
```

**Skip fixing if:**

- False positive (e.g., bot couldn't access private dependency)
- Requires architectural changes beyond PR scope
- Is purely stylistic with no correctness impact
- Auto-generated files that shouldn't be modified

### 10. Generate Summary

Render one section per reviewer that ran, in the order they were selected. Failed reviewers get a `⚠️ Failed: <reason>` section instead of findings. The top-level Verdict aggregates across reviewers and notes incomplete coverage when any reviewer failed or timed out.

**Per-reviewer section template:**

```markdown
### Codex findings  *(or "Copilot findings" / "CodeRabbit findings")*

| Severity | Count |
| -------- | ----- |
| Critical | X     |
| Major    | Y     |
| Minor    | Z     |
| Trivial  | W     |

<finding-by-finding list with file:line, issue, suggested fix; or "No findings — clean.">
```

If a reviewer failed:

```markdown
### Codex findings

⚠️ Failed: <reason — e.g., "session timed out at 15-min cap" / "plugin crash" / "malformed output">
```

**Summary template** — the base shape below; **when a spec resolved (step 2), add the spec-only blocks that follow it:**

```markdown
## PR Review Summary

**PR:** #<number> - <title>
**URL:** <url>
**Status:** Fixes applied (uncommitted)

### Verdict

Code quality: <Ready | N critical, M major remain>
<if any reviewer failed/timed out: append "(coverage incomplete — <reviewer> failed: <reason>)">

### Reviewer Coverage

| Reviewer    | Selected | Outcome              |
| ----------- | -------- | -------------------- |
| Codex       | yes/no   | Clean / N findings / Failed: <reason> |
| Copilot     | yes/no   | Clean / N findings / Failed: <reason> |
| CodeRabbit  | yes/no   | Clean / N findings / Failed: <reason> |

<one per-reviewer findings section per selected-and-completed reviewer, in selection order>

### Issues Processed (across all reviewers)

| Severity | Found | Fixed | Skipped |
| -------- | ----- | ----- | ------- |
| Critical | X     | Y     | Z       |
| Major    | X     | Y     | Z       |
| Minor    | X     | Y     | Z       |
| Trivial  | X     | Y     | Z       |

### Next Steps

1. Review the fixes: `git diff`
2. Commit: `/commit`
3. Push: `git push`
4. Mark PR as ready for review when satisfied
```

**Spec-only additions (a spec resolved):** after the **URL** line add two headers —

```markdown
**Spec:** `<slug>` *(from the board)*
**Board record:** recorded on <destination task> *(or: ⚠️ unrecorded — `<owner>/<repo>#<number>`; re-run reconciles by PR identity)*
```

— append to the Verdict `<if the board body was partial (step 4): "(PR body partial — could not load: <what>)">`, and insert a **Spec Compliance** section before Reviewer Coverage:

```markdown
### Spec Compliance *(board AC status, scoped to this repo's tasks)*

<status derived from the board — checked ACs = Met / unchecked = pending; no separate AC-verification pass (that is /review's job)>

| Requirement | Criteria Met | Status |
| ----------- | ------------ | ------ |
| FR1: <name> | 3/3          | ✅     |
| FR2: <name> | 2/2          | ✅     |
| FR3: <name> | 1/2          | ⚠️     |
```

## Cleanup

Spec/task state lives **on the central Backlog board**, not in local `specs/*.md` / `.tasks/` files — so there is **no local manifest to archive or remove** after merge. The board record this skill writes (step 4a: the PR's URL+number on the destination task) is the durable audit-trail link from the spec's tasks to the merged PR; `/implement` owns the tasks' **status** (Specced → In Progress → Done, kept visible); **archival** to `completed/` is **`/commit`'s confirmed ship-time offer** (single-repo specs) plus `backlog cleanup` (the safety net) — never `/implement`. Nothing in this skill leaves a file artifact behind to clean up.

## Error Handling

Step-owned failures are handled inline: reviewer selection / empty-selection / plugin-missing halt (5); per-reviewer failure and the 15-minute cap (6); uncertain `gh pr create` reconciliation and partial board reads while building the body (4); non-fatal PR-record write-back (4a); and all spec-resolution / degradation / fail-closed / cwd-bound rules (2–2c, per the contract). For PR-creation basics, check that the branch is pushed, branches exist on the remote, and `gh auth status` is clean. This section adds only the reviewer-trigger debugging hints:

- **No reviews from a selected reviewer:** confirm the step-5a trigger fired (PR comment for CodeRabbit, `gh copilot-review` for Copilot, the codex-rescue Agent for Codex) and that the GitHub bot is enabled on the repo.
- **Codex auth:** if `codex login` was never run, Codex's first call returns an auth error in its completion message — surface it; the user runs `codex login` and re-invokes.
- **Copilot extension missing:** check `gh extension list`; install with `gh extension install ChrisCarini/gh-copilot-review`.

## Related Skills

- `/spec` creates the board spec (milestone + tasks + `FR#-AC#` criteria → the PR body's traceability); `/implement <slug>` executes it (writing the `finalSummary` + AC check-offs + status this skill reads).
- `/review` is the local pre-PR code review and **owns AC verification** (`/review-pr` does not re-verify ACs); `/commit` records each pushed `{sha, ref}`, complementing this skill's PR record. All share this skill's board-awareness contract (`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`).
