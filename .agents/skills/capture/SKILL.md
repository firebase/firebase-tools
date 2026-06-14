---
name: capture
description: "Record a context-rich, spec-light task on the central Backlog board straight from the current working session — the fast inbox for \"this needs doing, but not now\". Captures a six-section brief (What / Why-trigger / Where / Background / Open questions / Rough scope) for a cold future session to pick up, labels it for the repo and sets it to Needs Spec so it surfaces as awaiting requirements (or Draft with --draft) with no milestone and no acceptance criteria — it never specs, plans, or resolves the work. Use when the user says \"capture this\", \"note this for later\", \"log a task\", \"add this to the board\", \"dump these findings\", or describes a follow-up/idea/bug to record rather than do now. Board-only: it writes one task per item via the backlog MCP and never creates a loose planning .md. Supports --batch (newline- or three-dash-delimited items, one task each) and --repo to target a repo other than the current one; hard-stops if the backlog MCP is unreachable."
allowed-tools:
  - mcp__backlog__get_backlog_instructions
  - mcp__backlog__task_list
  - mcp__backlog__milestone_list
  - mcp__backlog__task_create
  - mcp__backlog__task_edit
  - Bash(git status:*)
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git rev-parse:*)
argument-hint: "[<gist>] [--draft] [--batch] [--repo <name-or-path>]"
---

# Capture Skill

Record a follow-up, idea, or bug as a **context-rich, spec-light** task on the central
Backlog board — from inside whatever session surfaced it — so a cold future session can
pick it up without you in the room. Capture is the **fast inbox**: it writes down enough
context to make the work resumable, then stops. It does **not** spec, plan, estimate, or
resolve anything — that is `/spec`'s job once the task is picked up.

The pickup signal is the **`Needs Spec`** status: every captured task lands there, marking
the task as "real, but missing requirements — run `/spec` before `/implement`." Capture
writes the brief; `/spec` later turns it into acceptance criteria.

> This skill writes tasks to the **central Backlog board** (the `yourvid-ops` repo, via the
> `backlog` MCP server) — never to a local file. See `backlog-conventions.md` (plugin root)
> for the shared contract this skill builds on: the MCP precondition, the status-pipeline
> pickup signal, the captured-task shape, and the board-only / no-planning-identifier rules.
> This skill **cites** that contract and does not restate its rules.

## Usage

- `/capture <gist>` — record one task from the current session; defaults to `Needs Spec`.
- `/capture --draft <gist>` — record it in `Draft` (the raw, hidden inbox) instead of `Needs Spec`.
- `/capture --batch` — read several items (newline- or `---`-delimited) and record **one task per item**.
- `/capture --batch --draft` — the bulk-audit-dump form: many uncertain findings land in the hidden inbox at once.
- `/capture --repo <name-or-path> <gist>` — target a repo other than the current one (bare name resolves via `~/Repositories/YourVid/<name>`).

Flags combine freely with the gist: `/capture --draft --repo studio-backend Fix the N+1 in the feed query`.

## What capture is NOT

- **Not `/spec`.** It writes **no** acceptance criteria and assumes **no** resolution. If
  you find yourself deciding *how* to build it, stop — that belongs in `/spec` after pickup.
- **Not a planner.** No milestone, no decomposition, no dependencies, no estimates.
- **Not a file writer.** It never creates `specs/*.md`, a `.tasks/` entry, or any loose
  planning `.md` — the board is the only artifact (contract: *No planning-layer references
  in committed artifacts* / board-only).

## Process

### 0. Preconditions (Backlog board)

Before anything else, **verify the `backlog` MCP is reachable** — make one cheap read
(`mcp__backlog__get_backlog_instructions`, or `mcp__backlog__task_list`). If it is **not**
reachable (the `mcp__backlog__*` tools are absent, or the call errors), **hard-stop** — do
**not** fall back to writing a local file, and create nothing:

> The `backlog` MCP server is not connected. Check `claude mcp list`; reconnect or restart
> the session so it loads, then re-invoke `/capture`.

This is the shared MCP precondition from `backlog-conventions.md` (*MCP precondition*);
capture performs no work on this path.

### 1. Resolve the target repo

The captured task is labelled with the repo the work belongs to. Resolve that repo **once**,
up front, so every task in this run carries the same `repo:<name>` label.

**Default — the current repo's canonical name.** Resolve the cwd repo's **canonical** name
from its git **common** directory, not its worktree-local git dir, so a capture run from
inside a linked worktree still labels the **canonical** repo (e.g. `claude-code-plugins`),
never the worktree checkout:

```bash
COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
```

The canonical repo's working tree is `COMMON_DIR`'s parent when `COMMON_DIR` ends in
`/.git` (the primary checkout); for a worktree, `--git-common-dir` already points at the
**primary** repo's `.git`, so its parent is the canonical repo root. Take the **basename**
of that root as `<name>`. (A bare `--show-toplevel` would yield the *worktree* directory
name for a worktree session, which is exactly the wrong label — hence resolving via the
common dir.)

**Override — `--repo <name-or-path>`.** When `--repo` is passed, it wins over the cwd
resolution:

- A value containing a `/` (or starting with `~` / `.`) is treated as a **path**: expand it
  and validate it is a git working tree (`git -C <path> rev-parse --is-inside-work-tree`);
  derive `<name>` from its canonical root exactly as above.
- A **bare name** resolves via the shared convention to `~/Repositories/YourVid/<name>`;
  validate that directory is a git working tree.

**Unresolvable name or path → hard-stop** (do not guess, do not fall back to cwd): name the
specific problem (no such directory / not a git working tree) and stop without creating any
task. Resolving the wrong repo would mislabel the task and send the future picker to the
wrong codebase.

**No git context at all** (cwd is not a repo **and** no `--repo` given): hard-stop asking the
user to either run from inside the target repo or pass `--repo <name-or-path>`.

You may use the read-only git probes (`git status`, `git diff`, `git log`, `git rev-parse`)
to ground the brief's **Where** and **Background** — e.g. to confirm a path exists, cite the
file the current change touches, or reference a recent commit. These are **read-only**; this
skill never stages, commits, or mutates the repo.

### 2. Gather items (single vs `--batch`)

- **Single (default).** The whole argument (minus flags) is **one** gist → **one** task.
- **`--batch`.** Split the input into items and create **one task per item**. Accept **two**
  delimiters: a line containing only `---` (the explicit record separator), **or**, absent any
  `---`, one item per non-empty line. Trim surrounding whitespace; **skip blank items**. If
  `--batch` is set but only one item is found, proceed as a one-item batch (still report its ID).

If the gist (single) or every batch item is **empty**, ask the user for the content rather
than writing an empty task.

### 3. Compose the six-section brief (per item)

For **each** item, write the task `description` as the **six-section brief** below. This is
the captured-task shape from `backlog-conventions.md`; the goal is **resumability by a cold
session**, not completeness of design. Use the literal section headings, in this order:

```markdown
## What
<One or two sentences naming the change/outcome in plain terms. Describe the work, not how to build it.>

## Why / trigger
<What surfaced this and why it matters now: the incident, the review comment, the user report,
the thing you noticed mid-task. Non-empty — if there's truly no trigger beyond "noticed it",
say that.>

## Where
<At least one resolvable location in the target repo: a file path, directory, module, or
symbol. Name the repo if it differs from the obvious. This is the anchor the future session
starts from — never leave it vague.>

## Background
<Context the cold session won't have: links to the originating thread/PR/incident, the
relevant prior decision, constraints, a pointer to a related task or commit. Keep it to what
genuinely helps; "none" is acceptable if there is truly nothing to add.>

## Open questions
<The unknowns deliberately left for /spec to resolve — what's ambiguous, what needs a product
call, what you didn't verify. List explicit items, or the literal "none" if you are certain
there are none. This is where thin context goes: surface the gaps here rather than guessing.>

## Rough scope
<A non-binding gut sense of size/shape (e.g. "one-file fix", "touches the paginator + a
migration", "unsure — could be small or could cascade"). NOT an estimate, NOT a plan, NOT
acceptance criteria — just orientation for the picker.>
```

**Objective-completeness bar (enforce before writing):**

- **Where** names **≥1 resolvable** repo + file/path/module/symbol — not a vague gesture.
- **Why / trigger** is **non-empty**.
- **Open questions** is **present** — explicit items **or** the literal `none`.
- **Zero acceptance criteria** are written, and **no resolution is assumed** anywhere in the
  brief (no "the fix is…", no chosen approach). Thin context is fine — it flows into **Open
  questions**; capture records the gap, it does not close it.

A task that can't clear the **Where** / **Why** / **Open-questions** bar isn't capturable as
written: ask the user for the missing anchor rather than emitting an under-specified task.

### 4. Create the task(s) on the board

For **each** item, call `mcp__backlog__task_create` with:

| Field | Value |
| --- | --- |
| `title` | a short imperative title derived from the item's **What** (e.g. "Fix N+1 in the feed query") |
| `description` | the six-section brief from Step 3 |
| `labels` | exactly `["repo:<name>"]` — the resolved repo only |
| `status` | `Draft` when `--draft` was passed, else `Needs Spec` (the pipeline's first status, where the pickup signal now lives) |
| `priority` | only if the user stated one; otherwise omit |

**Omit entirely:** `milestone` (no spec yet — a captured task belongs to **no** milestone),
`acceptanceCriteria` (none — `/spec` writes those at pickup), `dependencies`,
`modifiedFiles`, `parentTaskId`, `finalSummary`. Do **not** invent any of these.

Set the `status` in the **same `task_create` call** so the task is never momentarily off the
pipeline. (Status and the `repo:<name>` label go in the single create; there is no need for a
follow-up `task_edit` unless a create returns without the status/label applied, in which case
reconcile via `task_edit`.)

`--draft` changes **only** the status (`Draft` vs `Needs Spec`) — a Draft task is still
awaiting requirements, just in the hidden inbox rather than the visible `Needs Spec` queue.

### 5. Additive, non-idempotent — partial-failure handling

Capture is **additive, not idempotent** (contract: the captured-task shape's additive note).
It does **not** de-duplicate against existing board tasks — re-running may create a duplicate;
**de-dup is a human-triage concern**, not capture's. Do **not** search the board to "avoid
duplicates" and skip a create.

On a **batch partial failure** (a `task_create` errors mid-run): **stop** at the first
failure, **report every ID already created**, name the item that failed and why, and tell the
user a re-run of the remaining items may duplicate the ones already created. Do not silently
retry the whole batch — that would duplicate the successes.

### 6. Report

Report concisely:

1. The **created task ID(s)** — every one, in creation order (this is the batch's receipt).
2. For each, its `title`, resolved `status` (`Needs Spec` / `Draft`), and the `repo:<name>` label.
3. A one-line reminder that each task is at **`Needs Spec`** — the next step is `/spec <task-id>`
   to turn the brief into acceptance criteria before `/implement`.
4. On a partial batch failure, the split: which IDs landed, which item failed, and the
   non-idempotent re-run caveat (Step 5).

Capture **finishes here** — it never chains into `/spec` or `/implement`; picking the task up
is a separate, deliberate act in a fresh session.

## Edge cases

| Scenario | Behavior |
| --- | --- |
| `backlog` MCP unreachable | **Hard-stop** with the reconnect message (Step 0); create nothing; never write a local file. |
| `--repo` name/path unresolvable | **Hard-stop** naming the problem (no such dir / not a git tree); do **not** fall back to cwd. |
| cwd not a repo and no `--repo` | **Hard-stop**: run from the target repo or pass `--repo`. |
| Capture from inside a worktree | Label the **canonical** repo (resolved via `--git-common-dir`), not the worktree checkout. |
| Thin / vague gist | Push the unknowns into **Open questions**; only block if **Where**/**Why** can't be met. |
| Empty gist / all-empty batch | Ask the user for content; do not write an empty task. |
| `--batch` with one item | Proceed as a one-item batch; still report its ID. |
| Batch partial failure | Stop; report created IDs + the failed item; warn re-run may duplicate (Step 5). |
| User starts designing the solution | Redirect: capture records the brief; **`/spec`** does the design after pickup. |

## Rules

- **Board-only.** Every write is a `task_create` (or a reconciling `task_edit`) via the
  `backlog` MCP. **Never** create a `specs/*.md`, a `.tasks/` entry, or any loose planning
  `.md` (contract: board-only / no-loose-artifacts).
- **No planning-layer identifiers in the task content.** Describe the work directly; do not
  embed `FR#-AC#` IDs, spec slugs, milestone names, or `T`-numbers in the brief (contract
  §6 / *IDs stay on the board*). The captured task has **no** spec yet — there are no such
  IDs to cite.
- **No acceptance criteria, no milestone.** A captured task is spec-light by definition; the
  `Needs Spec` status is the explicit marker that requirements are still owed.
- **Read-only in the repo.** The git probes are for grounding the brief only; capture never
  stages, commits, or otherwise mutates any repo.

## Related Skills

- `/spec <task-id>` picks up a `Needs Spec` task, reads its brief as the interview's starting
  context, and writes the acceptance criteria capture deliberately omits (moving the task from
  `Needs Spec` to `Specced`).
- `/implement <slug>` executes a spec once `/spec` has produced its acceptance criteria —
  never run directly on a `Needs Spec` task.
- See `backlog-conventions.md` (plugin root) for the status-pipeline pickup contract, the
  captured-task shape, and the board-only rules this skill builds on.
