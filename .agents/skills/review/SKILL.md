---
name: review
description: "Multi-reviewer code review of the local uncommitted diff (staged/unstaged/all). Use when the user asks to review changes, review the diff, or check code quality before committing — even if they don't say \"multi-reviewer\" — and after /implement completes. By default all three reviewers run concurrently — Claude (always), Codex (cross-model adversarial), and CodeRabbit (final gate) — with no picker; any default reviewer that is unavailable is skipped with a one-line note while the rest proceed. Claude is always in the reviewer set (the safe-default minimum); the --reviewers flag selects which opt-in externals (codex, coderabbit) run alongside Claude — so --reviewers codex runs Claude+Codex and --reviewers claude runs Claude only (local-only escape). Board-aware: takes an optional spec slug (or auto-detects one from the cwd diff against the central Backlog board) to verify that spec's acceptance criteria on the integrated diff and append a verdict comment to the board; with no resolvable spec it is a plain code-quality review. Findings are reported per-reviewer, and the lead Claude applies Critical/Major fixes and re-validates. Not for PR-side review — use /review-pr for that."
allowed-tools:
  - Skill
  - Edit
  - mcp__backlog__get_backlog_instructions
  - mcp__backlog__task_list
  - mcp__backlog__milestone_list
  - mcp__backlog__task_search
  - mcp__backlog__task_view
  - mcp__backlog__task_edit
argument-hint: "[<spec-slug>] [--staged | --unstaged] [--reviewers <externals: codex,coderabbit — run alongside the always-on Claude; 'claude' = Claude only>] [--report-only]"
hooks:
  Stop:
    - hooks:
        - type: command
          command: |
            # Safety check: ensure git stash was restored.
            # Warn-ONCE semantics: this guard nagged at 1,800+ consecutive stops
            # about the same unpopped stash in real sessions. A marker file keyed
            # by the stash commit hash limits it to one block per unique stash;
            # stop_hook_active additionally prevents re-blocks within one cycle.
            INPUT=$(cat)
            if printf '%s' "$INPUT" | jq -e '.stop_hook_active == true' >/dev/null 2>&1; then
              exit 0
            fi
            STASH_HASH=$(git stash list --format='%H %gs' 2>/dev/null | grep 'review: temp stash' | head -1 | cut -d' ' -f1)
            [ -z "$STASH_HASH" ] && exit 0
            MARKER="${TMPDIR:-/tmp}/claude-review-stash-warned-${STASH_HASH}"
            if [ -f "$MARKER" ]; then
              exit 0
            fi
            touch "$MARKER" 2>/dev/null
            echo '{"decision": "block", "reason": "CRITICAL: Git stash from review skill was not restored. Your unstaged changes are in the stash. Run: git stash pop — if it conflicts, leave the stash in place, inspect with git stash show -p, and tell the user. (This warning fires once per stash.)"}'
            exit 0
---

# Code Review Skill

Multi-reviewer code review on the local diff. By default **all three reviewers run** — the **Claude** sub-agent reviewer, **Codex** (cross-model adversarial review via `openai/codex-plugin-cc`), and **CodeRabbit** (independent final gate via the `coderabbit` plugin) — concurrently, with **no reviewer picker**. Availability is probed independently per reviewer — Codex's probe is **plugin/agent-type presence only** (its CLI/auth surface only at runtime, handled by per-reviewer failure handling in step 4d), while CodeRabbit additionally probes CLI presence, version, and auth before launch. Any reviewer in the default set found unavailable by its probe is **skipped with a one-line inline note** while the remaining reviewers proceed (the run never halts on a missing default reviewer). Claude is **always** in the reviewer set (the safe-default minimum); the `--reviewers <list>` flag selects which opt-in externals (`codex`, `coderabbit`) run **alongside** Claude — so `--reviewers codex` runs Claude + Codex, while `--reviewers claude` is the local-only escape that runs Claude alone and sends nothing to any external service. All reviewers run **concurrently** to minimize wall-clock time. Findings are surfaced **per reviewer** (no cross-reviewer dedup). After synthesis, the lead Claude applies Critical/Major fixes from any reviewer and re-validates.

**Important: The reviewing Claude must NOT be the same agent that implemented the code.** Self-review creates blind spots. The Claude reviewer is therefore always invoked as a fresh sub-agent via the `Agent` tool with `subagent_type: "general-purpose"` and `run_in_background: true` (never directly by the lead).

When a spec is resolved **from the central Backlog board** (Section 2), the Claude reviewer also performs **AC verification** — re-checking the resolved tasks' acceptance criteria on the full integrated diff to catch integration issues that per-task verification during `/implement` can miss — and the lead appends a single verdict comment back to the board's reviewed task(s) after fixes are applied (step 7e, gated by the planning-ref scan in 7d). Spec resolution, the cwd-bound rule, degradation, write-back, and read-failure handling are all governed by **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`** (the shared contract for `/review`, `/commit`, and `/review-pr`); this skill **cites** that contract and does not restate its rules. With no resolvable spec, board awareness adds nothing — `/review` is the same plain code-quality review it has always been.

## Usage

- `/review` — Multi-reviewer review with **no picker**. All three reviewers (Claude sub-agent + Codex + CodeRabbit) run concurrently; any one that is unavailable is skipped with a one-line note and the rest proceed. Lead Claude applies Critical/Major fixes after synthesis. With no slug arg, the spec is **auto-detected** from the cwd diff against the board (Section 2); if none resolves, the review is plain code-quality only.
- `/review <slug>` — Same review, but bound to the named spec. The board's tasks for that milestone supply the AC-verification checklist, and the verdict comment is appended to those tasks. An **explicit** slug is fail-closed: if it resolves to a repo other than the cwd's repo, or its lookup fails / matches zero tasks, `/review` stops (Section 2) rather than degrading.
- `/review --staged` or `/review -s` — Review only staged changes
- `/review --unstaged` or `/review -u` — Review only unstaged changes
- `/review --reviewers <list>` — Claude **always** runs as the safe-default minimum; this flag selects which **opt-in external** reviewers (`codex`, `coderabbit`) run **alongside** Claude. Comma-separated list of `claude`, `codex`, `coderabbit` (case-insensitive; whitespace around items ignored). So `--reviewers codex` runs **Claude + Codex**, `--reviewers codex,coderabbit` runs **all three**, and `--reviewers claude` runs **Claude only** (the local-only escape — sends nothing to any external service). An **empty or all-unrecognized** value is a **usage error**: the valid values (`claude`, `codex`, `coderabbit`) are printed and nothing runs (no silent Claude-only fallback). When an explicitly-named external reviewer is unavailable, the run **halts** with that reviewer's remediation message (an explicit request is not silently skipped).
- `/review --report-only` — Run reviewers and synthesize findings; skip the fix-application step

Flags can be combined: `/review --staged --report-only`, `/review --reviewers claude,codex --report-only`. The optional `<slug>` is the first positional argument and combines with any flags: `/review my-feature-slug --staged`.

## Process Overview

The review proceeds in three distinct phases:

1. **Setup (steps 1–3):** Detect changes, **resolve the spec from the board** (explicit slug or cwd-diff auto-detect, per the shared contract) and source its acceptance criteria, and resolve the reviewer set (default all three, or the `--reviewers` override) with per-reviewer availability probing.
2. **Concurrent reviewer execution (step 4):** All available reviewers in the resolved set (Claude sub-agent + Codex + CodeRabbit by default) run in parallel; state-change updates per reviewer.
3. **Synthesis, fix application & write-back (steps 5–7):** Per-reviewer findings sections + aggregated verdict; lead Claude applies Critical/Major fixes (unless `--report-only`); Claude re-validates; and — when a spec was resolved — the lead scans the applied fixes for planning-layer references, strips any, then appends one verdict comment to the board (step 7d).

---

## 1. Check for Changes

```bash
git status --porcelain
git diff --stat
git diff --cached --stat
```

Exit early if no changes match the requested mode (e.g., `--staged` with nothing staged).

## 2. Resolve the Spec from the Board and Source Its Acceptance Criteria

Spec context comes from the **central Backlog board**, not from `specs/*.md` / `.tasks/` files. The mechanics here — spec resolution (explicit vs. bare), target-repo resolution, the cwd-bound rule, degradation, and post-resolution read-failure handling — are defined in **`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`**. That section is the **single source of truth** shared with `/commit` and `/review-pr`; this step **cites** it and follows it exactly. Do **not** restate or fork its algorithm, and do **not** resurrect the removed file-based detection — "no spec" means "no board context," never "scan files."

**MCP availability (bare vs. explicit, per the contract's degradation rule):**

- **Bare call** (no `<slug>`): if the `backlog` MCP is unreachable, this is **not** a hard stop — drop straight to **spec-less** (a plain code-quality review) per the contract's degradation rule. The single auto-detect read described below is the *only* board read a bare run makes; a spec-less run never re-reads.
- **Explicit call** (`/review <slug>`): an explicit request is **fail-closed** — if the `backlog` MCP is unreachable (or the lookup can't prove completeness), **report the cause and stop**. Do not degrade an explicitly named spec to spec-less.

### 2a. Resolve the spec (hybrid — contract §1)

Resolve per the contract's **Spec resolution** (§1). `/review`'s only specialization is the scope of "changed files" for the bare auto-detect: the **cwd diff in the requested mode** (`--staged` → staged; `--unstaged` → unstaged + untracked; default → all uncommitted). In brief:

- **Explicit `<slug>`** → `task_list milestone=<slug>` (slug = milestone title), paged to provable completeness; **fail closed** on lookup failure or zero tasks — never degrade an explicit slug to spec-less.
- **Bare** → one exhaustive read; auto-detect by overlap of the cwd diff against tasks' `modifiedFiles` (compared as full `<repo>/<path>`), grouped by `milestone`. Single clear winner → select + **announce** (an explicit slug overrides); **tie or zero overlap → spec-less**. A task with malformed `milestone` is excluded + reported; if that flips the outcome, degrade to spec-less naming it.

### 2b. Resolve the target repo and apply the cwd-bound rule (per the contract's "Target-repo resolution" + "Execution scope")

Once a spec is resolved, take its **target repo** from the resolved tasks' `modifiedFiles` `<repo>/` prefix (per the contract — the canonical source; the `repo:<name>` label is now set on every executable task too but `modifiedFiles` stays primary), and validate `~/Repositories/YourVid/<name>` is a git working tree.

`/review` is **cwd-bound** (the CodeRabbit subprocess, reviewer sub-agents, lint/test, `Edit` ops, and the stash-recovery `Stop` hook are all rooted at the current working directory and are **not** safely retargetable). Therefore:

- **Explicit slug whose resolved repo ≠ the cwd's repo:** **fail closed** — do **not** retarget. Stop with: `this spec targets <repo>; cd into <repo> and re-run` (where `<repo>` is the resolved repo name). The same fail-closed applies to the contract's target-repo failures (missing path / not a git tree / the resolved tasks name more than one distinct repo) — name the specific problem and stop.
- **Bare auto-detect can never hit this mismatch** — it matched the cwd's own diff (Section 2a), so its resolved repo *is* the cwd repo by construction. (A bare-call target-repo failure degrades to spec-less, not a halt.)

**"The resolved tasks"** throughout means the executable tasks of the resolved spec **scoped to the one resolved repo**, with the cross-repo coordination parent excluded.

### 2c. Source the acceptance criteria from the board (the AC-verification checklist)

When (and only when) a spec is resolved, read each resolved task (`mcp__backlog__task_view`) and collect its `acceptanceCriteria` — each item is already **`FR#-AC#`-prefixed** on the board (the `FR#-AC#` ID followed by the criterion text, per the `acceptanceCriteria` convention in `backlog-conventions.md`). The concatenation of these criteria across the resolved tasks **is** the AC-verification checklist passed to the Claude reviewer sub-agent in step 4a (against the integrated cwd diff). This **replaces** the former `specs/*.md` AC scan entirely.

**Post-resolution read-failure handling (per the contract's "Post-resolution read-failure handling").** If a board read needed for AC sourcing is **partial, malformed, or times out *after* a spec has already resolved**, do **not** present AC verification as complete: **name the un-loadable ACs** (the tasks/criteria that failed to load), pass only the criteria that actually loaded to the reviewer, verify just those, and **warn** in the verdict. This is distinct from the bare-call MCP-unreachable path (which degrades *before* any spec resolves, step 2/2a) — here a spec is already in hand, so the run continues with a partial, clearly-flagged checklist rather than dropping to spec-less.

**Context levels:**

| Resolved                         | Claude reviewer behavior                                        |
| -------------------------------- | -------------------------------------------------------------- |
| No spec (spec-less)              | Code-quality review only — no board reads after resolution, no writes |
| Spec resolved (ACs fully loaded) | Code-quality review + AC verification against the integrated diff + board write-back (steps 7d–7e) |
| Spec resolved (ACs partial)      | As above, but verify only the loaded ACs; name the un-loadable ones and warn |

There is **no** `.tasks/` file-to-task map and **no** per-task attribution layer — task attribution in findings was a file-based artifact and is not carried over. Findings are grouped per reviewer (step 5); AC outcomes roll up against the resolved tasks' criteria (step 6).

## 3. Resolve the Reviewer Set

There is **no reviewer picker** — do **not** issue an `AskUserQuestion` for reviewer selection. Resolve which reviewers to run from the `--reviewers` flag, defaulting to **all three**:

| Reviewer     | Role                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `claude`     | Claude sub-agent reviewer. Always in the set; cannot be dropped — the mandatory safe-default minimum that runs **alongside** any opt-in externals (so `--reviewers codex` still runs Claude implicitly). |
| `codex`      | Opt-in cross-model adversarial review via `openai/codex-plugin-cc`, run alongside Claude. Catches what a single-model loop misses. |
| `coderabbit` | Opt-in independent final-gate review via the `coderabbit` plugin, run alongside Claude.            |

**Default set (no flag): `claude, codex, coderabbit`, run concurrently.** Claude can never be dropped — it is the safe-default minimum that runs alongside any externals; `--reviewers` (parsed per **Usage**) only selects which opt-in externals (`codex`, `coderabbit`) join it. An **empty or all-unrecognized** `--reviewers` value is a **usage error**: print the valid values (`claude`, `codex`, `coderabbit`) and run nothing — no silent Claude-only fallback (`--reviewers claude` is a *valid* Claude-only run, not an error).

How a reviewer entered the set decides its availability handling in 3a:

- **Default** (no flag): an unavailable reviewer is **skipped gracefully**.
- **Explicitly named** (in `--reviewers`): an unavailable reviewer **halts** with its remediation message. Claude is always implied and always available, so it never halts.

### 3a. Per-reviewer availability probe (graceful skip for defaults, halt only for explicitly-named)

Probe availability **independently per reviewer** in the resolved set, then decide per reviewer whether to run it, skip it, or halt — based on **how that reviewer entered the set** (default vs. explicitly named, from step 3). The **probe semantics** (what each check is and what "available" means) and the **full skip-note / halt-remediation message table** live in **`references/reviewer-availability.md`** — read it for the per-reviewer definitions and the exact message strings; this step keeps only the *decision* and the *script call*.

**The decision (kept here):**

- **A default reviewer that is unavailable is SKIPPED, not fatal.** Drop it from the run, print the **one-line inline skip note** from `references/reviewer-availability.md` (e.g. `CodeRabbit skipped: not authenticated`, `Codex skipped: plugin not installed`), and **proceed with the remaining available reviewers**. Never halt the skill for a missing default reviewer. (Claude is always available, so the default run always has at least Claude.)
- **An explicitly-named (`--reviewers`) reviewer that is unavailable HALTS** the skill with that reviewer's **verbatim remediation message** from `references/reviewer-availability.md` — an explicit request must not be silently dropped. If several explicitly-named reviewers are unavailable, surface all their remediation messages together (one per failure) and exit cleanly; do not partially run.

Which note/message to use is selected from the matrix in `references/reviewer-availability.md` keyed by **how the reviewer entered the set** (default → skip note; explicit → remediation message) and **why it is unavailable** (the condition / CodeRabbit `<reason>` row).

**Codex — plugin/agent-type presence check (kept inline; agent-state, not a CLI probe):**

Codex availability is **only** whether `openai/codex-plugin-cc` is registered in this session (the `codex:codex-rescue` agent-type resolves). This is agent state the skill observes directly — there is no script, no subprocess, and no pre-launch Codex CLI/auth probe. The Codex CLI and its auth surface only at runtime; if it later errors (e.g. `codex login`), that is a per-reviewer **runtime** failure (step 4d: record it, continue), never this availability check. Plugin present → Codex is available; absent → skip-note (default) or halt with the remediation message (explicit), both from `references/reviewer-availability.md`.

**CodeRabbit — plugin presence (inline) + CLI probe (delegated to `scripts/probe-coderabbit.sh`):**

CodeRabbit is available only when **both** hold:

1. **Plugin registered (inline check).** The `coderabbit` plugin is registered in this session — agent state the skill observes directly. If absent → CodeRabbit is unavailable with the **`coderabbit` plugin absent** row (skip-note or halt message per how it entered the set); do **not** run the CLI probe.
2. **CLI probe passes** (only when the plugin check passed). Run the committed probe script — it performs the CLI-present, version ≥ 0.4.0, and authenticated checks (each `coderabbit` call bounded by its own portable ~10s process-group watchdog) and returns a single verdict. Resolve and invoke it per **`scripts/README.md`** (prefer `${CLAUDE_PLUGIN_ROOT}`; the auto-approve hook already whitelists this script by name):

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/probe-coderabbit.sh"
   ```

   **Key off its verdict (exit code is authoritative — `scripts/README.md` exit-code contract):**

   | Probe result                                   | CodeRabbit availability                                                                 |
   | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
   | `available` (exit 0)                           | **Available** — proceeds to step 4.                                                      |
   | `unavailable: <reason>` (exit 1)               | **Unavailable** — map `<reason>` (`cli-missing` / `too-old` / `not-authenticated` / `unresponsive`) to its row in `references/reviewer-availability.md` for the skip-note or remediation message. |
   | exit 2, script unresolved, or `--protocol` ≠ 1 | **FAIL-SAFE → Unavailable** as `unresponsive` (per `scripts/README.md`'s fail-safe rule — **never** treat an internal-error / unresolved / protocol-mismatch result as available). |

   Confirm `--protocol` prints `1` before trusting the verdict (per `scripts/README.md`); on any mismatch, take the fail-safe `unresponsive` path. The fail-safe guarantees CodeRabbit is **never** falsely reported available.

After this step, the **available** reviewers in the resolved set proceed to step 4. If, in a default run, every external reviewer was skipped, that is fine — Claude alone is a complete review (the run proceeds with just Claude).

---

## 4. Concurrent Reviewer Execution

**Pre-launch working-tree isolation (`--staged` / `--unstaged` modes only):** Before launching any reviewer, isolate the working tree so all reviewers see the same diff scope. Without this, a per-reviewer stash dance would race against the others reading the working tree concurrently.

For `--staged` mode (review only staged changes; hide unstaged + untracked):

```bash
NEED_STASH=0
git diff --quiet || NEED_STASH=1
[ -n "$(git ls-files --others --exclude-standard)" ] && NEED_STASH=1
[ "$NEED_STASH" = "1" ] && git stash push -u --keep-index -m "review: temp stash"
```

For `--unstaged` mode (review only unstaged + untracked; hide staged) — requires Git 2.35+:

```bash
NEED_STASH=0
git diff --cached --quiet || NEED_STASH=1
[ "$NEED_STASH" = "1" ] && git stash push --staged -m "review: temp stash"
```

Default mode (all changes): no stash. The stash is restored after synthesis in step 6a so the fix-application phase sees the full working tree.

Launch the Claude sub-agent and every other **available** reviewer in the resolved set (step 3 / 3a) **in parallel** — by default that is Codex and CodeRabbit alongside Claude; reviewers skipped in step 3a are not launched. Each reviewer runs independently and reports findings back. While they run, emit one-line **state-change** updates per reviewer (no "still running" filler):

```
[+0m08s] claude: in_progress
[+0m12s] codex:  in_progress
[+0m15s] coderabbit: in_progress
[+1m45s] coderabbit: completed
[+2m30s] claude: completed
[+5m12s] codex:  completed
```

**`Agent(run_in_background: true)` delivers a completion notification — there is no polling.** The lead emits state-change updates only when an Agent transitions (`in_progress` → `completed` / `failed`). Between transitions, the lead yields the turn and waits passively. No `sleep` loop, no cadence ticks.

**Maximum total wait for the concurrent block: 15 minutes (900 s).** Enforced via a deadline-marker, not polling: at the moment the available reviewer Agents are spawned, the lead also spawns `Bash(run_in_background: true, command: "sleep 900")` as a deadline marker. The synthesis-trigger condition is: every launched reviewer Agent reached a terminal state (`completed` or `failed`) OR the deadline-marker sleep completed. Reviewers still `in_progress` when the deadline-marker fires are marked `⚠️ Failed: timeout (15 min)` in step 5; synthesis proceeds. If all reviewers complete before deadline, either let the sleep finish (no harm, output discarded) or kill it via `KillShell` against its shell-id.

**Permission note:** the deadline-marker `sleep 900` isn't covered by the auto-approve hook (scoped to codex-companion + coderabbit), so without `Bash(sleep:*)` in `~/.claude/settings.json` the user gets a one-time prompt on first `/review`. Add `Bash(sleep:*)` to `permissions.allow` to make the cap silent.

### 4a. Claude sub-agent (always runs)

**Reviewer independence:** The Claude reviewer is invoked as a fresh sub-agent via the `Agent` tool with `subagent_type: "general-purpose"` and `run_in_background: true` — never directly by the lead. A fresh context avoids the implementer's blind spots and produces higher-quality findings.

**Get the diff:**

```bash
# For --staged mode
git diff --cached

# For --unstaged mode
git diff

# For all changes (default)
git diff HEAD
```

**Sub-agent invocation:**

```
Agent({
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "Claude code review",
  prompt: "Review the following diff for bugs, security issues, edge cases, error handling,
  and code quality. Diff mode: <all | staged | unstaged>. Files: <list>.

  Read each file's full diff and current content. Run the project's linter and
  formatter first (e.g., ruff check, ruff format --check, eslint, prettier --check)
  and report violations as findings.

  Review checklist (per changed file):
  - Correctness: logic errors, off-by-one, null/undefined access, wrong return types, race conditions
  - Security: injection (SQL, XSS, command), unsanitized input, hardcoded secrets, insecure defaults
  - Error handling: missing try/catch, swallowed errors, unhelpful messages, unhandled promise rejections
  - Edge cases: empty inputs, boundary values, concurrent access, Unicode/special characters
  - Resource management: unclosed connections/handles, missing cleanup, memory leaks, unbounded growth
  - API contracts: breaking changes, missing validation, inconsistent response formats
  - Code clarity: unnecessary nesting/complexity, redundant abstractions, poor names, obvious comments,
    nested ternaries (prefer if/else or switch)
  - Project conventions: violations of CLAUDE.md standards (read CLAUDE.md if not already loaded)

  Classify each finding by severity (Critical | Major | Minor | Trivial).

  <If a spec was resolved from the board (Section 2), also include the AC-verification
  pass. Pass the acceptance criteria sourced from the resolved tasks in step 2c — each
  already FR#-AC#-prefixed — verbatim:>
  Verify each acceptance criterion below against the integrated diff. For each AC, mark
  exactly one of: Met | Partially met | Not met | N/A. For any Partially met or Not met,
  state the specific gap (what is missing or wrong). For N/A, say why it can't be checked
  from the diff (e.g. requires runtime testing).
  Acceptance criteria (from the board's resolved tasks): <list of FR#-AC# ACs from step 2c>
  <If step 2c could only load some ACs (partial board read), pass only the loaded ones and
  add: "These ACs could not be loaded from the board and were NOT verified: <names>. Do
  not assume their status.">

  Return findings in this shape per item:
    SEVERITY: Critical | Major | Minor | Trivial
    FILE:LINE: <path>:<line>
    ISSUE: one sentence
    SUGGESTED FIX: concrete change"
})
```

For very large diffs (>500 lines), the sub-agent may itself fan out per logical file group and aggregate.

### 4b. Codex (if in the resolved set and available)

Spawn the `codex:codex-rescue` agent via the `Agent` tool with `subagent_type: "codex:codex-rescue"` and `run_in_background: true`. The Agent prompt has three parts in order: a `--wait` routing handle line, an explicit read-only directive sentence, then the FP1 focus prompt verbatim:

```
Agent({
  subagent_type: "codex:codex-rescue",
  run_in_background: true,
  description: "Codex adversarial review",
  prompt: "--wait

This is a read-only review pass. Do not modify any files; only report findings.

<FP1 focus prompt — verbatim, see below>"
})
```

`run_in_background: true` lets Codex run concurrently. The `--wait` handle is recognized and stripped by the codex-rescue agent's `codex-cli-runtime` skill, forcing **foreground** `codex-companion.mjs task` (no `--background`) so the CLI runs synchronously in the subagent's single Bash call; its stdout returns verbatim and the Agent's completion notification delivers the review — no polling (the codex status/result slash commands are `disable-model-invocation`, so Claude can't call them). The read-only directive selects the agent's review-without-edits branch (skips `--write`); the codex-companion sandbox defaults to `read-only` regardless.

**Hook-compatibility:** the full prompt (wrapper + FP1) must contain **no backtick and no `$(`** — the auto-approve hook (`auto-approve-codex-coderabbit.sh:26-28`) silently falls through on either, stalling the subagent's Bash call on a permission prompt. FP1 is clean. **Routing/migration:** codex-rescue forwards through `codex-companion.mjs task`, not the dedicated `adversarial-review` backend (which is `disable-model-invocation` / user-only) — FP1 carries the adversarial framing in text, so quality holds. When the plugin exposes a model-invocable adversarial-review entry point, swap to it and drop the `--wait` + read-only lines (that backend self-routes and is read-only by design).

#### FP1 — Focus prompt (verbatim, passed to Codex on every call)

> The following prompt is used **verbatim** as the Codex focus prompt for `/review`. Do not paraphrase or trim.

```
You are reviewing code changes as a fresh second pair of eyes. Claude is reviewing (or has reviewed) the same diff in parallel; your value is catching what its review may have missed. Read the diff and the affected files cold.

Focus on:

- Race conditions, transactional boundaries, partial-failure handling
- Edge cases in input validation and data shape (empty, null, very large, Unicode/special chars)
- Resource leaks: unclosed connections/handles, missing cleanup, unbounded growth
- Error handling gaps: swallowed errors, unhelpful error messages, unhandled promise rejections
- Subtle correctness: off-by-one, wrong return type, type coercion surprises, async/await mistakes
- Security: injection vectors (SQL, command, XSS), hardcoded secrets, insecure defaults
- API contracts: breaking changes, missing input validation, inconsistent response formats

For each finding output:
  SEVERITY: Critical | Major | Minor | Trivial
  FILE:LINE: <path>:<line>
  ISSUE: one sentence
  SUGGESTED FIX: concrete change

Skip stylistic nits. If the diff is genuinely solid, say so plainly. Do not invent issues to seem thorough — your value is catching what was missed, not validating what was written.
```

### 4c. CodeRabbit (if in the resolved set and available)

Invoke CodeRabbit via a direct `coderabbit review --agent -t uncommitted` Bash call, wrapped in a sub-agent so its (potentially long) output stays isolated from the main review context. The wrapper subagent skips the CR slash command's prereq checks because step 3a already verified CLI presence, version, and auth. The working-tree isolation (if any) was already applied by step 4's preamble — CodeRabbit just reviews the working tree as-is.

**Severity mapping (CodeRabbit `--agent` output → `/review` taxonomy):**

The `coderabbit review --agent` mode emits a JSON `severity` field with one of: `critical | major | minor | trivial | info` (lowercase, machine output — distinct from the human-readable web UI labels `Critical | Suggestions | Positive`). Match case-insensitively:

| CodeRabbit `--agent` severity | `/review` taxonomy |
| ----------------------------- | ------------------ |
| `critical`                    | Critical           |
| `major`                       | Major              |
| `minor`                       | Minor              |
| `trivial`                     | Trivial            |
| `info`                        | Minor              |
| *(any other)*                 | Minor (fallback)   |

Unmapped severities (upstream taxonomy drift beyond the five listed) fall back to `Minor` with the raw severity surfaced verbatim alongside the mapped bucket — divergence is silent + visible to the reader.

**Sub-agent invocation:**

```
Agent({
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "CodeRabbit review",
  prompt: "Run CodeRabbit on the current uncommitted changes via Bash. Use this exact command:

  coderabbit review --agent -t uncommitted

  Always -t uncommitted, regardless of /review's mode flag — the working-tree-isolation preamble has already stashed the appropriate counterpart so the working tree shows exactly the diff scope to review.

  Prereqs (CLI installed + authenticated) were verified by the lead in step 3a. Do not re-run coderabbit --version or coderabbit auth status — go straight to the review command.

  Map CodeRabbit's --agent severities (lowercase machine output) to /review's taxonomy, case-insensitively:
    critical -> Critical
    major    -> Major
    minor    -> Minor
    trivial  -> Trivial
    info     -> Minor
    (any other) -> Minor (fallback, surface raw severity verbatim)

  Report each finding as:
    [<mapped-severity>] <file>:<line> — <description> (CodeRabbit: <native-severity>)

  If CodeRabbit returns no findings, report 'Clean — no issues found.'

  IMPORTANT: coderabbit may exit NON-ZERO while still emitting valid output (review_context JSON, plain-text-mode findings — 57 recorded runs did exactly this). Judge success by whether the output contains parseable review content, not by the exit code. Only report '⚠️ Failed: <reason>' when there is no usable review output (auth error, network failure, empty/garbage stdout)."
})
```

The Bash command (`coderabbit review --agent -t uncommitted`) matches the auto-approve hook's `CODERABBIT_RE` regex literally, so the wrapper subagent's only Bash call is auto-approved without prompting.

### 4d. Per-reviewer failure handling

If an individual reviewer call fails (network, rate limit, plugin crash, sub-agent error, malformed output, timeout), record the failure reason and continue. The reviewer's section in step 5 will show `⚠️ Failed: <reason>` and the rest of the synthesis proceeds. The aggregated verdict in step 6 notes incomplete coverage. A single failed reviewer never halts the overall flow.

---

## 5. Per-Reviewer Findings Sections

Render each reviewer's findings in its **own section** with its **own severity summary table**. **Do not deduplicate findings across reviewers** — each section stands alone. Cross-reviewer overlap is left as visual signal (a reader can compare sections; convergence on the same issue is itself useful information).

For each reviewer that ran (Claude sub-agent always; Codex and CodeRabbit when in the resolved set and available), include:

```markdown
### Claude sub-agent

| Severity | Count |
| -------- | ----- |
| Critical | X     |
| Major    | X     |
| Minor    | X     |
| Trivial  | X     |

- [Critical] <file>:<line> — <description>
- [Major] <file>:<line> — <description>
- ...

### Codex

| Severity | Count |
| -------- | ----- |
| Critical | X     |
| Major    | X     |
| Minor    | X     |
| Trivial  | X     |

- [Critical] <file>:<line> — <description>
- ...

### CodeRabbit

<same shape>
```

For a reviewer that failed, replace its body with:

```markdown
### <Reviewer>

⚠️ **Failed: <reason>** — findings unavailable for this reviewer; the verdict notes incomplete coverage.
```

For a reviewer that completed cleanly with no findings, render the table with all zeros and a one-line `Clean — no issues found.` note.

## 6. Aggregated Verdict and Output Budget

**Output budget check.** Full summaries with the AC table and per-reviewer findings can exceed the ~500-token output cap (recurring issue across review sessions). If the expected output is likely to exceed ~400 tokens, emit a compact verdict first and let the user pick a section to expand:

```markdown
## Review Verdict

- **Code quality:** <Ready | N critical, M major remain>
- **Claude:** <Clean | N findings | Failed>
- **Codex:** <Clean | N findings | Failed | Skipped: <reason> | Not in set>
- **CodeRabbit:** <Clean | N findings | Failed | Skipped: <reason> | Not in set>
- **Spec compliance:** <X of Y criteria Met> (if a spec was resolved; `partial — some ACs could not be loaded` if step 2c read was partial)
- **Recommendation:** <Ready to commit | Address gaps first>

**Expand which section?** `claude` | `codex` | `coderabbit` | `acceptance-criteria`
```

Render the requested section in the next turn. For smaller reviews (estimated < ~400 tokens), render the full template directly.

**Aggregated verdict shape (top of the full report):**

- `Code quality:` `Ready` if no Critical/Major remain across **any** reviewer; otherwise `N critical, M major remain` (counts summed across all reviewers).
- Per-reviewer status: `Clean`, `N findings`, `Failed: <reason>`, `Skipped: <reason>` (a default reviewer dropped in step 3a for unavailability), or `Not in set` (excluded by an explicit `--reviewers` list).
- `Spec compliance:` `X of Y criteria Met` (when a spec was resolved from the board). If step 2c's AC read was partial, append `(N ACs could not be loaded — not verified)` so partial coverage is never read as complete.
- `Recommendation:` `Ready to commit` (no Critical/Major across reviewers and every loaded AC is Met) or `Address gaps first` otherwise. If any reviewer failed, append `(coverage incomplete: <reviewer> failed)`; if AC sourcing was partial, append `(coverage incomplete: some ACs unverifiable)`.

**Full report structure (rendered when the budget allows or after expand):**

```markdown
## Review Summary

### Verdict

<Aggregated verdict per shape above>

### Findings by Reviewer

<One sub-section per reviewer that ran or was selected, per step 5>

### Acceptance Criteria Verification

<If a spec was resolved from the board (Section 2), from the Claude sub-agent's AC pass.
One row per FR#-AC# AC sourced in step 2c. Status is exactly one of Met / Partially met /
Not met / N/A; Notes carries a specific gap for any Partially met or Not met, and the
reason for any N/A. If step 2c could not load some ACs, add a row per un-loadable AC with
status `Not verified` and a Notes value naming the load failure — never silently omit it.>

| Criterion               | Status        | Notes                             |
| ----------------------- | ------------- | --------------------------------- |
| FR#-AC#: <description>  | Met           |                                   |
| FR#-AC#: <description>  | Partially met | Missing edge case for empty input |
| FR#-AC#: <description>  | Not met       | Not implemented in this diff      |
| FR#-AC#: <description>  | N/A           | Requires runtime testing          |
| FR#-AC#: <description>  | Not verified  | Board read for this AC timed out  |
```

## 6a. Restore working-tree isolation

If step 4's preamble stashed the working tree (`--staged` or `--unstaged` mode with `NEED_STASH=1`), restore it now — before fix application — so the lead Claude can edit files against the full working tree:

```bash
# --staged mode
[ "$NEED_STASH" = "1" ] && git stash pop

# --unstaged mode (preserve staged-only semantics on pop) — requires Git 2.35+
[ "$NEED_STASH" = "1" ] && git stash pop --index
```

Default mode (`NEED_STASH=0` or unset): no restore.

If `git stash pop` fails (conflict), surface the git error, leave the stash in place, suggest `git stash show -p` to inspect the stashed changes, and do NOT continue to step 7. The Stop hook in this skill's frontmatter will also catch any unrestored `review: temp stash` entry on session end.

## 7. Fix Application and Board Write-Back (fix + write-back skipped if --report-only)

After all reviewers that ran complete and findings are synthesized, the **lead Claude** (not a sub-agent) applies fixes for **Critical and Major findings from any reviewer** (7a–7c), then — when a spec was resolved from the board — scans the applied fixes for planning-layer references and strips any (7d), and appends one verdict comment to the board (7e). This is a separate post-review step — reviewers report read-only; fix application and write-back are their own pass.

If `--report-only` was passed, **skip this entire step** (7a–7e): reviewers still ran and the synthesis (including the AC verification table) is shown, but **no fixes are applied and no board write-back occurs** — a `--report-only` run is read-only end to end, including on the board. Render the final summary and stop.

### 7a. Apply fixes

For each Critical/Major finding (across all reviewers, highest severity first):

1. Read the affected file for context
2. Verify the issue is valid (not a false positive — false positives are reported in the summary as skipped)
3. Apply the fix using the `Edit` tool
4. Move to the next finding

Skip a finding if it would require major architectural changes, is purely stylistic, or is a confirmed false positive. Skipped items are listed in the summary with the reason.

**Balance guard:** When fixing issues, do not introduce overly clever solutions. Prefer explicit, readable code over compact one-liners. Do not remove helpful abstractions that aid code organization. Fixes should make the code simpler and more maintainable — never harder to understand or debug.

### 7b. Claude re-validates (Claude only)

After fixes are applied, **only the lead Claude** re-validates by re-reading the diff for the fixed files. **Codex and CodeRabbit do NOT re-run** — re-running them would be expensive, may add diff drift, and isn't needed when Claude can self-validate the targeted fixes.

Check that:

- The project's linter/formatter passes on the fixed files (same commands the reviewer sub-agent ran in step 4a — e.g., ruff check, ruff format --check, eslint, prettier --check); run the project's test suite scoped to the affected packages when one exists and is fast
- Each applied fix correctly addresses the reported issue
- No new issues were introduced in adjacent code
- **Re-evaluate every loaded acceptance criterion** against the post-fix diff (not only the ones previously Met) — a fix may move an AC from Not met / Partial → Met, or a regression may move a Met → Not met. These **post-fix** statuses are what 7e records, so the board verdict reflects the code as it now stands, not the pre-fix step-6 snapshot

If new issues are found during re-validation, fix them in-place and re-validate again. Do not loop indefinitely — if re-validation surfaces more than a couple of new Critical/Major issues, surface them in the summary as "introduced during fix application" and stop, recommending a fresh `/review` invocation.

### 7c. Update the summary

Update the per-reviewer findings sections (step 5) to mark fixed items, and update the **Issues Processed** roll-up:

```markdown
| Severity | Found | Fixed | Skipped |
| -------- | ----- | ----- | ------- |
| Critical | X     | Y     | Z       |
| Major    | X     | Y     | Z       |
| Minor    | X     | —     | —       |
| Trivial  | X     | —     | —       |
```

(Minor/Trivial are not auto-fixed; counts shown for awareness only.)

> **Steps 7d–7e run only when a spec was resolved from the board (Section 2).** On a spec-less run, stop after 7c: no board reads, **no board writes**, no new prompts (per the contract's degradation rule). Do not resurrect file-based detection to manufacture a write target.

### 7d. Strip planning-layer references from the applied fixes (before any board write)

Before writing anything to the board, scan **the source changes `/review` itself applied** in 7a (and any follow-up edits from 7b's re-validation) for **planning-layer references** and strip them — committed code must never carry them. This enforces the shared contract's **`### 6. No planning-layer references in committed artifacts`** rule on the lines this skill edited, and it gates the write-back: the scan happens **before** the 7e comment is posted.

Scan the applied edits (the lines `/review` touched, not the whole file) for any of: board/task IDs, `spec:<slug>` slugs, board document or milestone names, `FR#-AC#` acceptance-criterion IDs, `T`-numbers, and spec/doc paths — in code comments, test names, test docstrings, and module/class/function docstrings. If a fix introduced one (e.g. a comment that pasted an AC's `FR#-AC#` prefix verbatim into a code line), **rewrite that line to describe the behavior directly** (state what the code does, with no planning-layer token) and re-run the 7b lint/format check on the changed file. The board↔git link is one-directional (the contract): the board may record a commit SHA, but nothing in committed code points back at the board.

(This scan is scoped to `/review`'s **own** applied fixes — it is not a full-tree audit of pre-existing code, which is out of scope for a review pass.)

### 7e. Append the verdict comment to the board (one per run)

When a spec was resolved (Section 2), append **exactly one** verdict comment to the board per the shared contract's **`### 5. Write-back conventions`**. This step is **append-only** — it uses `mcp__backlog__task_edit` with `commentsAppend` and **never** toggles an acceptance-criterion checkbox or a task `status` (those belong to `/implement`).

- **Destination & idempotency** (§5): one `commentsAppend` to the §5 destination (single-repo → the resolved repo's lowest-numbered executable task; cross-repo → the coordination parent), stamped with a stable per-run fingerprint (e.g. `review-run:<id>`); on an uncertain result, re-read the task and check for the fingerprint before retrying — never duplicate, never drop. A **definite** write-back failure is non-fatal: the applied fixes stay in the working tree — report it and continue.
- **Content:** the **per-AC verdict summary** (each FR#-AC# with its **post-fix** Met / Partially met / Not met / N/A status — re-evaluated in 7b, **not** the pre-fix step-6 snapshot — plus any `Not verified` ACs from a partial step-2c read, named as such so partial coverage never reads as complete) **plus** the **Critical/Major findings applied** in 7a. Exclude Minor/Trivial and skipped/false-positive items beyond a count. If the spec has **no** ACs, omit the per-AC summary and post a **findings-only** comment with an explicit "no acceptance criteria defined" note (the one-comment-per-run rule still holds).
- The verdict lives **on the board**, the contract's explicit exception to the no-planning-refs rule (§6) — so `FR#-AC#` IDs are expected here (exactly why 7d strips them from the *code* first).

---

## Error Handling

Most failure modes are handled inline at the step that owns them: reviewer availability — skip-default / halt-explicit / usage-error (3, 3a); mid-run reviewer failure and the 15-minute cap (4, 4d); stash-pop conflict (6a, also enforced by the Stop hook); no changes (1); and everything board-side — bare-vs-explicit degradation, fail-closed, non-cwd repo, multi-repo scoping, partial AC reads, and write-back idempotency (2–2c, 7e), all per the contract. This section adds only what those steps don't state:

- **Codex auth not set up** is **not** caught by the availability probe (plugin/agent-type presence only) — it surfaces at runtime on Codex's first call as a `codex login` prompt, handled as a per-reviewer runtime failure (4d). Surface it verbatim; the user runs `codex login` and re-invokes.
- **Resolved spec's tasks carry no acceptance criteria:** warn there is nothing to verify and run the code-quality review — but a spec **is** resolved, so 7e still posts its one verdict comment as **findings-only** (applied Critical/Major fixes + a "no acceptance criteria defined" note). It does **not** skip the write-back.

## Related Skills

- `/spec` creates the board spec (milestone + tasks + `FR#-AC#` criteria); `/implement <slug>` executes them — run both before reviewing.
- `/commit` commits the reviewed changes; `/review-pr` runs the PR-side bot reviews (Codex + Copilot + CodeRabbit on the PR diff). Both share this skill's board-awareness contract (`backlog-conventions.md` → `## Board awareness for /review, /commit, and /review-pr`).
