---
name: implement
description: Orchestrate spec implementation using direct execution, sub-agents, or Agent Teams. Reads the task decomposition from the central Backlog board (selecting by the spec's milestone via the backlog MCP), executes with per-task and wave-level verification, and writes status / acceptance-criteria check-offs / final summaries back to the board — leaving all code changes uncommitted for /review. Use whenever a spec on the board should be turned into code — when the user says "implement the spec", "build it", "execute the plan", or names a spec slug — even if they don't say /implement. Not for ad-hoc fixes without a spec; run /spec first to produce the decomposition this skill requires.
allowed-tools:
  - Write
  - Edit
  - Bash(npm test:*)
  - Bash(npm run:*)
  - Bash(npx:*)
  - Bash(pytest:*)
  - Bash(cargo test:*)
  - Bash(go test:*)
  - Bash(make:*)
  - Bash(date:*)
  - Bash(mkdir:*)
  - Bash(shasum:*)
  - Bash(sha256sum:*)
  - Bash(python3:*)
  - Bash(test:*)
  - Bash(rm:*)
  - mcp__backlog__get_backlog_instructions
  - mcp__backlog__task_list
  - mcp__backlog__task_search
  - mcp__backlog__task_view
  - mcp__backlog__task_edit
argument-hint: "<spec-slug> [--mode direct|sub-agents|team] [--dry-run] [--loop] [--max-turns N] [--gate \"<cmd>\"]"
hooks:
  # No PreToolUse specs/*.md write-guard: specs are Backlog documents, not files,
  # so there is nothing for it to guard.
  # Loop mode (--loop): on every stop, run the project's working-tree quality gate
  # and block-until-green, bounded by a turn cap + no-progress + hard-error aborts.
  # This is a NO-OP unless the arming step (see "Loop mode" below) wrote
  # .tasks/.loop-state.json — so default /implement behavior is unchanged.
  Stop:
    - hooks:
        - type: command
          command: |
            # Locate the loop engine: prefer the plugin root, else the newest cached
            # copy (robust if CLAUDE_PLUGIN_ROOT is not set in this hook context). If
            # it cannot be found, exit 0 (no-op) — the loop simply does not engage.
            S="${CLAUDE_PLUGIN_ROOT:-}/hooks/implement-loop-stop.sh"
            [ -f "$S" ] || S=$(ls -t "$HOME"/.claude/plugins/cache/*/yourvid-tools/*/hooks/implement-loop-stop.sh 2>/dev/null | head -1)
            [ -n "$S" ] && [ -f "$S" ] && bash "$S"
            exit 0
---

# Implementation Orchestration Skill

Take a completed spec and produce working code that satisfies all acceptance criteria, leaving changes uncommitted for human review. Chooses the right execution strategy based on task complexity: direct implementation, sub-agent delegation, or Agent Teams.

## Philosophy

- **Acceptance criteria are contracts** — a task is not done until its criteria are verified
- **Hooks beat prompts** — safety is enforced by PreToolUse hooks, not by hoping agents comply
- **Fresh context per task** — each worker gets a clean context with only what it needs
- **File ownership prevents conflicts** — no two parallel workers edit the same file
- **Separate implementer and reviewer** — the agent that writes code must never review its own work. Use a separate sub-agent or teammate for `/review`. Self-review creates blind spots; a fresh agent catches what the author missed
- **Lint and format are part of "done"** — code is not done until it passes the project's linter and formatter. Every sub-agent must run both checks before reporting success. The lead verifies after each wave
- **Human control is non-negotiable** — all changes stay uncommitted for review
- **Spec / AC refs stay out of committed code** — `FR#-AC#` IDs, `spec:<slug>`, and task IDs live on the Backlog board, never in source. Comments like `# FR2-AC4: ...` or `# implements task X` couple committed code to identifiers it should not carry. Use those IDs only on the board and in inter-agent prompts. In committed code (production source AND tests), describe behavior directly: "rejects oversized payloads before any DB write" beats "FR2-AC3: per-action cap before DB call." Test names follow the same rule — `test_rejects_oversized_action_payload` beats `test_FR2_AC3_rejects_oversized`

## Usage

- `/implement <slug>` - Implement the spec's tasks from the board (auto-detect strategy)
- `/implement <slug> --mode direct|sub-agents|team` - Force an execution strategy
- `/implement <slug> --dry-run` - Show the execution plan (strategy + dependency order) without implementing
- `/implement <slug> --loop` - Bounded autonomous loop: after the lead believes the work is done, a Stop hook runs the project's working-tree quality gate and **blocks-until-green**, feeding gate failures back as guidance (see Loop mode below)
- `/implement <slug> --loop --max-turns 5` - Same, capping failing gate iterations at 5 (default 8, hard maximum 20)
- `/implement <slug> --loop --gate "uv run pytest -m unit -q"` - Same, with an explicit gate command instead of auto-discovery

## Loop mode (`--loop`)

`--loop` wraps the whole implementation in a bounded "keep going until the gate is green" loop. It is **opt-in**: without `--loop`, nothing below runs and `/implement` behaves exactly as it always has (the Stop hook is a no-op when no loop-state file exists). The loop is driven by the `Stop` hook (`hooks/implement-loop-stop.sh`): every time the lead tries to end its turn, the hook runs the gate; a green gate disarms the loop and lets the session stop, a red gate **blocks** the stop and feeds the gate's own output back as the next instruction. Termination is guaranteed by a turn cap and a no-progress abort — never by hoping the agent stops.

> **Best models, no downgrade.** The loop re-blocks the *same* lead session — it never spawns a cheaper model to do the fixing. The implementer stays on its session model throughout.

### When to arm (and when not to)

Parse the flags from `$ARGUMENTS`, then arm the loop at exactly one point — which **differs by execution strategy** (the hook fires on *every* lead stop, so arming must wait until a lead stop should actually run the gate):

- **DIRECT / SUB-AGENTS:** arm **after** Step 1 (task selection from the board) and **immediately before** the first task is implemented. Here the lead's only stop is when it believes the work is done.
- **AGENT-TEAMS:** do **NOT** arm before execution. The lead is delegate-only and yields turns (stops) repeatedly while teammates work; an armed loop would run the gate against a half-built tree mid-coordination. Arm only at **post-teardown** — in 4c.7, after all teammates have shut down and you own the integrated tree, immediately before the lead's final stop.

A spec that fails validation must never arm a loop.

- **No `--loop`:** do not arm. Still perform the *stale-state clear* below (so a marker left by a killed `--loop` session can't hijack this run).
- **`--dry-run`:** never arms (it does not implement). If `--loop` is also present, print one line — "loop ignored for --dry-run" — and proceed.
- **`--gate` or `--max-turns` without `--loop`:** print one line — "ignoring --gate/--max-turns (no --loop)" — and proceed as a normal run.
- **`--max-turns N`:** must be an integer in `1..20`. Reject `0`, non-integers, and `N > 20` with a one-line error and do **not** arm (lower it, or split the work). Default is 8.

**Stale-state clear (every run, loop or not):** before proceeding, remove any leftover marker:

```bash
rm -f "${CLAUDE_PROJECT_DIR:-.}/.tasks/.loop-state.json"
```

(Single-file `rm -f` — the plugin's `pre_tool_use.py` allows it; it only blocks *recursive* rm.)

### Gate discovery (working-tree scope)

The loop gate must check the **working tree** (the loop's edits are uncommitted), so it is *not* the staged `.githooks/pre-commit` gate. **Do not re-derive the precedence here** — it is owned by `scripts/discover-gate.sh` and documented in `references/loop-gate-contract.md` (the fixed `--gate` > executable `scripts/gate.sh` > Justfile > pyproject/ruff > package.json order, the sorted-path concatenation for multiple same-toolchain roots, and the ambiguous-multi-toolchain ⇒ no-gate rule). Call the script and branch on its exit code:

1. **Resolve the script path** per `scripts/README.md` (prefer `${CLAUDE_PLUGIN_ROOT}/scripts/discover-gate.sh`; if `CLAUDE_PLUGIN_ROOT` is unset, fall back to the newest cached copy in a separate step). If it cannot be resolved **or** `bash discover-gate.sh --protocol` does not print `1`, take the fail-safe path (step 4) — do **not** arm.
2. **Invoke it** as a standalone Bash command (the auto-approve hook allows this exact shape — no substitution, no chaining, no output redirect), passing `--gate "<cmd>"` **only if** the operator supplied one, followed by **the owned in-repo file paths** (the `modifiedFiles` entries with their `<repo>/` prefix stripped, resolved to real paths so the script can walk up to each project root):

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/scripts/discover-gate.sh" [--gate "<cmd>"] <owned-file> [<owned-file>...]
   ```

3. **Branch on the exit code** (never parse stdout text to decide):
   - **exit 0** → stdout is the resolved gate command, shell-quoted as one token via `printf '%q'` (e.g. `uv\ run\ ruff\ check\ .`). **Read that stdout from the tool result and un-quote it** to the plain command (`uv\ run\ ruff` → `uv run ruff`); arm with the plain command (Arming, below). There is **no** prompt-free way to capture it into a shell variable — `line=$(bash …)` needs command substitution, which the hook rejects — so recover it by reading the result, **not** via `$(…)` or `eval`. Do not word-split it or add quotes.
   - **exit 1** → stdout is the sentinel `NO_GATE`: no unambiguous gate. Do **not** arm. Print: "no unambiguous working-tree gate discovered; pass `--gate '<cmd>'` or add `scripts/gate.sh`", and continue as a normal (non-loop) run.
4. **exit 2, or the script is unresolved / protocol-mismatched** → **fail-safe no-gate**: do **not** arm a gate (a false gate is worse than none). Continue as a normal (non-loop) run; surface the same one-line no-gate notice.

**Never** arm with an empty or always-passing gate — the script guarantees it never emits one, and steps 1/4 guarantee that an unresolved script degrades to no-gate rather than to a guessed command.

### Arming

Write the marker with the **Write** tool (no shell needed) to `${CLAUDE_PROJECT_DIR}/.tasks/.loop-state.json`:

```json
{ "armed": true, "gate_cmd": "<resolved command>", "max_turns": 8, "turn": 0, "noprogress": 0, "last_hash": "", "created_at": "<date -u +%Y-%m-%dT%H:%M:%SZ>" }
```

`gate_cmd` is the **plain** command recovered by un-quoting discovery's `%q` stdout (Gate discovery, step 3), written as a normal JSON string. Do not paste the raw `%q` stdout (the backslash-escaped form) — un-quote it first; the marker holds the plain command, not the shell-quoted token. `turn`/`noprogress`/`last_hash` start empty; the hook maintains them. `created_at` is informational (the hook judges staleness by file mtime, 6h TTL). Then proceed with normal execution (Step 4). You do not run the gate yourself — the Stop hook does, when you next try to finish.

### What the loop does on each stop (reference — the hook owns this)

- **gate passes** → delete the marker, print `implement-loop: gate passed — loop complete`, stop.
- **gate fails** → increment `turn`, block with the (sanitized, byte-capped) gate output as guidance: "fix these and continue".
- **turn cap reached** (`turn ≥ max_turns`) or **no progress** (identical gate output twice in a row) → one final block telling you to summarize the remaining failures and stop, then disarm.
- **gate can't run** (exit 124/125/126/127/≥128) → one final block ("the gate command failed to run; disarming"), then disarm — looping cannot fix a broken gate.
- A terminal block (cap / no-progress / hard-error) is emitted **only after the marker is confirmed deleted**. If the marker can't be removed (e.g. an unwritable `.tasks/`), the hook emits **no** block and just lets the stop proceed — a block left beside a surviving armed marker would re-fire every stop and trap the session.
- Any unmanageable state (missing `jq`, malformed/half-written marker, out-of-range `max_turns`, unwritable `.tasks/`) → the hook **fails open**: best-effort deletes the marker and lets the stop proceed. It never commits, stages, or pushes.

### Per-mode behavior

- **DIRECT / SUB-AGENTS:** the loop wraps the lead's stop. After you believe all tasks/waves are complete and try to end, the gate runs; on failure **you** fix-and-retry. Because the gate fires *after* you first considered the work done, each fix iteration must also update the affected Backlog tasks (status / `acceptanceCriteriaCheck` / `finalSummary` via `mcp__backlog__task_edit`) before you next try to stop, so the board reflects the gated-green result.
- **AGENT-TEAMS:** you arm the loop at **post-teardown** (see When to arm — *not* before execution), so it engages only at the lead's final stop, after teammates have shut down and you own the integrated tree. Mid-team failures are still handled by the existing team flow, and teammate spawns are unaffected. Since the lead is delegate-only, resolve a post-teardown gate failure by spawning **a single fresh fix sub-agent** (the same pattern as 4c.7 step 2) — do **not** start editing directly.

### Gate contract reference

The `scripts/gate.sh [--staged | --working]` convention and the full working-tree discovery precedence live in **`references/loop-gate-contract.md`** (plugin root) — the single source of truth that `scripts/discover-gate.sh` implements. This skill **cites** that contract and does not restate it; authoring a per-repo `gate.sh` is out of scope here (discovery degrades gracefully via the tooling probe or `--gate` until a repo adds one).

## Process

### 1. Preconditions, then select the spec's tasks from the board

`$ARGUMENTS` is a **spec slug** (the slug the spec was authored under; carried as each
task's `milestone`). The decomposition lives on the central Backlog board — see `backlog-conventions.md` (plugin
root) for the full contract.

**MCP precondition.** Verify the `backlog` MCP is reachable (one cheap read —
`mcp__backlog__get_backlog_instructions` or `mcp__backlog__task_list`). If it is not
reachable, **hard-stop**: "The `backlog` MCP server is not connected. Check
`claude mcp list`; reconnect or restart the session so it loads, then re-invoke." Do
**not** fall back to `specs/*.md` / `.tasks/`; do no work.

**Select the spec's tasks.** The slug is the milestone's **title**, so select via
`task_list`'s server-side **`milestone` filter**:

1. `mcp__backlog__task_list milestone=<slug>` — the MCP resolves the title and returns
   the spec's tasks; **page through the result until provably complete**.
2. **Fail closed** if the query errors, the MCP is unreachable, or completeness can't be
   proven — never act on a partial set.
3. If zero tasks match, report "no tasks with milestone `<slug>` on the board" and stop.

For each matched task, read it (`mcp__backlog__task_view`): title, description, acceptance
criteria, `dependencies`, `modifiedFiles`, `parentTaskId`, `status`. Build:

- **Tasks:** the matched set (criteria, deps, owned files each).
- **Dependency graph:** from each task's `dependencies`.
- **File ownership + target repo:** from each task's `modifiedFiles` (`<repo>/<path>`
  format). For every executable task, resolve its **target repo** from its `modifiedFiles`
  `<repo>/` prefix (always present and the canonical source — the `repo:<name>` label is now
  set on every executable task too but `modifiedFiles` stays primary, so use the label only
  as a cross-check); operate inside that
  repo's working directory, stripping the `<repo>/` prefix from each `modifiedFiles` entry
  to get the in-repo path. (Per-repo worktrees are a W4 concern; here at least scope each
  task's file operations to its resolved repo.)
- **Coordination parent (cross-repo):** any task that is the `parentTaskId` of others is a
  grouping node — **exclude it from the executable set**; mark it `Done` once all its
  children are `Done`.

The board is the live source of truth — there is **no** `.tasks/` manifest, no
`spec-snapshot.json`, and **no** PATCH/MINOR/MAJOR change-classification (a task edited on
the board between waves is simply picked up on the next re-read — see FR-style write-back
in Steps 4/6).

**Resume is implicit:** skip tasks already `Done`; a task left `In Progress` by a prior
(dead) single session is reset to `Specced` before re-execution (single-operator
assumption); continue from the dependency frontier. Never start a task whose
`dependencies` are not all `Done`.

### 2. Choose Execution Strategy

Evaluate the spec against these thresholds (or use `--mode` to override):

**DIRECT** — implement yourself, no delegation:

- 3 or fewer tasks, AND
- All tasks are sequential (each depends on the prior), AND
- No task is tagged high-risk

**SUB-AGENTS** — parallel Task() delegation:

- 4–8 tasks, AND
- Clear file ownership boundaries (no two independent tasks share files), AND
- Tasks don't need inter-agent communication

**AGENT TEAMS** — full team deployment:

- 5+ tasks with complex dependency graph, OR
- Tasks require cross-cutting coordination (shared interfaces, API contracts), OR
- Spec explicitly requests parallel implementation

Default for ambiguous cases: **sub-agents** (lower cost, simpler coordination).

```
IF task_count <= 3 AND all_sequential AND no_high_risk:
    → DIRECT
ELIF task_count <= 8 AND clear_file_boundaries AND no_inter_task_communication:
    → SUB-AGENTS
ELIF task_count >= 5 OR cross_cutting_coordination:
    → AGENT TEAMS
ELSE:
    → SUB-AGENTS (default)
```

| Signal                   | Direct       | Sub-agents            | Agent Teams               |
| ------------------------ | ------------ | --------------------- | ------------------------- |
| Task count               | 1–3          | 4–8                   | 5+ with dependencies      |
| Parallelism              | None/minimal | Independent tasks     | Interdependent + parallel |
| File overlap             | Acceptable   | Low (clear ownership) | None (strict ownership)   |
| Inter-task communication | None         | None needed           | Required                  |
| Coordination complexity  | Trivial      | Moderate              | High                      |

Announce the chosen strategy and reasoning before proceeding.

If `--dry-run`, show the execution plan (strategy, task assignment, dependency order) and stop.

### 3. The board is the manifest (no local files)

The board IS the manifest — no `.tasks/` directory, no `spec-snapshot.json`. Update the
Step-1 task records (status, criteria, dependencies, `modifiedFiles`) in place via the
`backlog` MCP as work proceeds (Steps 4 and 6); create no local task/manifest/snapshot
files. (The `--loop` marker `.tasks/.loop-state.json` is unrelated and stays.)

### 4a. DIRECT Execution

For each task in dependency order (skip `Done` tasks; never start one whose `dependencies` are not all `Done`):

1. **Claim:** `mcp__backlog__task_edit` set `status: "In Progress"`.
2. Implement the task, staying within its `modifiedFiles` ownership.
3. Run tests relevant to the task's acceptance criteria.
4. Run the project's linter and formatter — fix any violations.
5. **Verify + check off:** for each acceptance criterion, verify it; then — **re-reading the task first** (`mcp__backlog__task_view`) so you never check off against criteria that changed since you started — check it off with `mcp__backlog__task_edit acceptanceCriteriaCheck`.
6. **Complete:** the step-5 re-read immediately precedes this; if anything intervened, re-read once more (`mcp__backlog__task_view`) and re-plan if criteria/dependencies changed. Then write a prose `finalSummary` (what shipped) and set `status="Done"` — both via `mcp__backlog__task_edit`, **not** `task_complete`. `/implement` marks Done and leaves the task **visible**; archival is deferred to ship-time (see `backlog-conventions.md` → "Task lifecycle and archival").
7. Proceed to the next unblocked task.

If any criterion fails after implementation, fix the issue and re-verify before completing. Once all leaf children of a cross-repo coordination parent are `Done`, mark the parent `Done` (`task_edit status="Done"`, **not** `task_complete`).

Skip to Step 6.

### 4b. SUB-AGENT Execution

Identify independent task groups (tasks with no unresolved dependencies) that can run in parallel.

For each wave of independent tasks:

1. **Re-read the frontier** from the board (`mcp__backlog__task_list milestone=<slug>` — the server-side milestone filter) so this wave sees current task state.
2. **Claim each task** `In Progress` on the board (`mcp__backlog__task_edit`), then spawn a Task() sub-agent per task with this prompt structure:

```
You are implementing one task (id <task-id>) from the spec `<slug>`.

## Task
<task description>

## Acceptance Criteria
<list of specific criteria this task must satisfy>

## File Ownership
You may ONLY modify these files:
<list of files from files-owned>

Do NOT modify any files outside this list.
If you need changes in other files, report what's needed and stop.

## Code Quality
<project's lint and format commands, e.g.:>
- Lint: <e.g. ruff check src/ tests/>
- Format: <e.g. ruff format --check src/ tests/>

Your code MUST pass both checks before you report success.

## No spec / AC references in committed code
Do NOT cite spec paths, T-numbers, or AC IDs (`FR1-AC1`,
`NFR2-AC3`, ...) in code comments, test names, test docstrings, or
module/class/function docstrings (production source AND tests) —
such refs dangle when planning files move. Describe behavior
directly: `test_rejects_oversized_action_payload` beats
`test_FR2_AC3_rejects_oversized`. Those IDs belong only on the board
and in your report back to the lead, never in committed source.

## Instructions
1. Implement the task to satisfy all acceptance criteria
2. Run relevant tests to verify
3. Run lint and format checks — fix any violations
4. Report: which criteria pass, which fail, and what files you modified
```

3. Wait for all parallel sub-agents to complete
4. **Wave verification:** Run the full test suite, linter, and formatter across all modified files. Fix any regressions or formatting issues before proceeding — sub-agents may produce code that passes their own checks but conflicts with other waves
5. Verify each task's acceptance criteria by reviewing the modified files
6. **Record completion on the board** for each task: re-read it (`mcp__backlog__task_view`) immediately first, check off each verified criterion (`task_edit acceptanceCriteriaCheck`), write a prose `finalSummary` (`task_edit`), then mark it `Done` via `task_edit status="Done"` (**not** `task_complete` — archival is ship-time, per the contract).
7. If any criteria fail, create a focused follow-up Task() to fix
8. Repeat for the next wave of unblocked tasks (re-reading the frontier from the board, per step 1)

Skip to Step 6.

### 4c. AGENT TEAMS Execution

#### 4c.1: Create the team

Create an agent team named `impl-<slug>`.

#### 4c.2: Populate the shared task list

For each task in the spec, create a task in the Agent Teams shared task list:

- **Subject:** task title matching the spec
- **Description:** include file ownership list, acceptance criteria, and the full task description
- **blockedBy:** references matching the spec's dependency graph

#### 4c.3: Determine teammate roles

Analyze the dependency graph to find the maximum set of tasks that can run in parallel. Spawn one teammate per independent task cluster (max 5 teammates).

**Teammate assignment strategy:**

1. Group tasks by their position in the dependency graph
2. Apply file ownership constraints — if two independent tasks share files, assign them to the same teammate
3. Balance workload — aim for 3–6 tasks per teammate

Each teammate's spawn prompt must include:

```
You are a teammate implementing tasks for the spec `<slug>`.

## Your Assigned Tasks
<list of task IDs and titles>

## File Ownership
You may ONLY modify these files:
<consolidated list of files from all assigned tasks>

Do NOT modify files outside this list.

## Acceptance Criteria
<full list of criteria for all assigned tasks>

## No spec / AC references in committed code
`specs/*.md` and `.tasks/` are never committed. Do NOT cite spec
paths, T-numbers, or AC IDs (`FR1-AC1`, `NFR2-AC3`, ...) in code
comments, test names, test docstrings, or module/class/function
docstrings — refs would dangle. Describe behavior directly. AC IDs
/ T-numbers belong only in `.tasks/` files and in your messages to
the team lead.

## Instructions
1. Check the shared task list for your next available task
2. Claim the task and implement it
3. Verify the acceptance criteria pass (run tests if applicable)
4. Mark the task complete
5. Pick up the next unblocked task assigned to you
6. When all your tasks are done, send a message to the team lead
   with: tasks completed, test results, and any issues found

Do NOT commit any changes. Leave everything uncommitted.
```

Use Sonnet model for teammates unless the spec flags tasks as architecturally complex.

#### 4c.4: Activate delegate mode

Switch to delegate mode. From this point, coordinate only:

- Monitor task progress via the shared task list
- Respond to teammate messages
- Verify acceptance criteria as tasks complete
- Reassign work if a teammate is stuck

Do NOT implement code directly. That's what teammates are for.

#### 4c.5: Require plan approval for high-risk tasks

If any task in the spec is tagged as high-risk (database migrations, authentication changes, public API modifications), require plan approval for the teammate handling it. They work in read-only plan mode until you approve their approach.

Review the plan: does it cover all acceptance criteria? Does it respect file ownership? Approve or reject with specific feedback.

#### 4c.6: Monitor and verify

As each task completes:

1. **Re-read the board** between task completions so the next dispatch sees current task state.
2. Read the teammate's completion message.
3. Verify acceptance criteria by reading the modified files and checking test results.
4. **Record completion on the board:** re-read the task (`mcp__backlog__task_view`) immediately first, then check off each verified criterion (`mcp__backlog__task_edit acceptanceCriteriaCheck`), write a prose `finalSummary` (`task_edit`), and mark it `Done` via `task_edit status="Done"` (**not** `task_complete` — archival is ship-time, per the contract). (A teammate claims its task `In Progress` via `task_edit` when it starts — see 4c.3.)
5. If criteria fail, message the teammate with specific feedback; the task stays `In Progress`.

#### 4c.7: Land the plane

When all tasks show `Done` on the board AND complete in the shared task list:

1. Run the full test suite (detect the project's test runner)
2. If tests fail, identify which task's changes caused failure and spawn a single sub-agent to fix (not a new team)
3. Request shutdown for all teammates
4. Wait for shutdown confirmations
5. Clean up the team
6. Proceed to Step 6

### 5. Handle Failures

If any task fails after 2 retry attempts:

1. Mark it failed on the board with a `failed` label (`mcp__backlog__task_edit` + a `finalSummary` note with the reason) — the task keeps its pipeline status; `failed` is an orthogonal flag, not a pipeline state
2. Check if downstream tasks can still proceed without it
3. If not, leave the dependent tasks gated by their existing `dependencies` (the unmet dependency on the failed task is what holds them — there is no separate "blocked" status to set)
4. Continue with all tasks that CAN proceed
5. Report failures clearly in Step 6

If a teammate crashes or becomes unresponsive:

1. Check the task list for any in-progress tasks with no recent activity
2. Reset those tasks to `Specced` on the board (`mcp__backlog__task_edit`)
3. Reassign to another teammate or spawn a replacement

### 6. Report (the board is the summary)

There is **no** `.tasks/SUMMARY.md` to write — each task already carries its own
`finalSummary`, checked-off acceptance criteria, and `Done`/`failed` status on the board
(from Steps 4/5). Do **not** create any local summary file.

First verify the board reflects reality: every executable task is `Done` (its criteria
checked off) or explicitly `failed`; each cross-repo coordination parent is `Done` once
its children are. Then announce to the user:

- The spec slug and per-task outcome (X of Y `Done`; any `failed`, with the reason from
  its `finalSummary`).
- Files modified (from the tasks' `modifiedFiles`).
- A test-results summary and anything needing human attention.

> Implementation complete. X of Y tasks Done (on the board).
> Run `/review` to inspect the uncommitted changes, then `/commit` when satisfied.

Do NOT commit any changes. All code modifications remain uncommitted for human review.

## Safety Rules

**Non-negotiable invariants:**

- Never `git commit` from within this skill — all commits happen via `/commit`
- Never `git add -A` or `git add .` — files stay unstaged for review
- Never modify files outside a task's ownership set during parallel execution
- Never run with `--dangerously-skip-permissions` — it propagates to all teammates

**Hook recommendations for projects using Agent Teams:**

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "INPUT=$(cat); CMD=$(printf '%s' \"$INPUT\" | jq -r '.tool_input.command // empty'); if printf '%s' \"$CMD\" | grep -qE '\\bgit\\s+(commit|push|reset\\s+--hard)\\b'; then echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"Commits and pushes are only allowed via /commit skill\"}}'; fi"
          }
        ]
      }
    ]
  }
}
```

**Delegate mode enforcement:**

When using Agent Teams (Step 4c), the lead MUST be in delegate mode. If you catch yourself about to edit a file during team execution, stop — message a teammate instead.

**Permission inheritance:**

All teammates inherit the lead's permission settings. This is automatic and cannot be changed per-teammate. Ensure the lead's permissions are appropriate before spawning the team.

**Spec write protection:** there is no PreToolUse `specs/*.md` write-guard — specs live on the board, not as `specs/` files, so there is nothing to write-guard. To change a spec, edit its tasks on the board (or re-run `/spec`, which reconciles by slug).

## Verification Approach

**For behavioral criteria** ("user can do X"): trace the code path, run tests if available.

**For data criteria** ("field is stored in Y"): read the model/schema changes.

**For performance criteria** ("responds within Xms"): check for obvious issues but note this needs runtime testing.

**For security criteria** ("input is sanitized"): verify sanitization code exists in the diff.

If no automated tests exist for a criterion, note it as "verified by code review" in the summary. These need manual testing.

## Error Handling

| Scenario                         | Action                                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| `backlog` MCP not connected      | Hard-stop with remediation (Step 1); no `specs/`/`.tasks/` fallback   |
| Slug matches no tasks            | Report "no tasks with milestone `<slug>`", stop                        |
| Task-list completeness ambiguous | Stop; do not act on a partial set (Step 1)                            |
| No `modifiedFiles` on a task     | Derive ownership from the description, warn about conflict risk        |
| Sub-agent returns with failures  | Retry once, then mark the task `failed` on the board and continue     |
| Teammate unresponsive            | Wait 2 minutes, then reassign task                                    |
| All tasks blocked by a failure   | Stop, report what failed and why                                      |
| Test suite not found             | Skip automated verification, note it                                  |
| File conflict detected           | Stop conflicting tasks, reassign to a single worker                   |
| Session interrupted              | The board preserves all state; resume re-reads it (Step 1, implicit)  |
| Task edited on the board mid-run | Picked up on the next wave re-read; re-read before any check-off       |
| Mid-run board write fails        | Stop dispatch; reconcile the affected task via `task_view` on resume  |

## Gotchas

- **Sub-agent waves can stall on permission prompts.** `permissions.allow` does not propagate to Task() sub-agents (anthropics/claude-code#18950), and the plugin's auto-approve hooks cover only codex-companion.mjs/coderabbit commands (auto-approve-codex-coderabbit.sh) and four read-only Drive/Gmail MCP tools (auto-approve-recall-readonly.sh) — workers running `npm test`/lint may each block on a human approval, serializing a "parallel" wave.
- **The board is the source of truth — never hand-edit `backlog/` files.** All task state changes go through the `backlog` MCP tools (`task_edit`, never `task_complete` from `/implement`). If the MCP is unreachable, hard-stop (Step 1) — never write `.tasks/`/`specs/` as a fallback.
- **A green wave is not a green suite.** Sub-agents can pass their own checks while conflicting with another wave — always run the full test suite, linter, and formatter across all modified files between waves.

## Related Skills

- **Before:** `/spec` creates the spec document + milestone + tasks on the board.
- **After:** `/review` (code review on the uncommitted diff) → `/commit` (plain-prose bodies, never spec/task IDs) → `/review-pr` (PR + bot reviews).

> `/review`, `/commit`, and `/review-pr` are all Backlog-aware — each resolves the active
> spec from the board (explicit slug, else auto-detect from the changed files / PR diff)
> and verifies/enriches against it — see `backlog-conventions.md → ## Board awareness for
> /review, /commit, and /review-pr`.
