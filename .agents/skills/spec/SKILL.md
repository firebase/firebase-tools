---
name: spec
description: "Deep requirements engineering through structured interview. Explores the codebase, asks non-obvious questions, and produces a spec document + milestone + agent-sized tasks on the central Backlog board (testable acceptance criteria with FR1-AC1 IDs) that /implement executes. Use whenever the user wants to spec or scope a non-trivial feature — \"write a spec\", \"spec out X\", \"requirements for X\", \"acceptance criteria\" — or describes a multi-step feature with no matching spec yet on the board. Also picks up an existing capture: given a task id (`/spec <task-id>`) it reads that task's spec-light brief and right-sizes it — enriching the single task in place (acceptance criteria + modifiedFiles + milestone, moving it from Needs Spec to Specced) for one-session work, or decomposing into a milestone + document + child tasks for genuinely multi-task work. Runs a Codex cross-model review of the finished spec by default (use --no-codex to skip)."
allowed-tools:
  - Write
  - mcp__backlog__get_backlog_instructions
  - mcp__backlog__document_create
  - mcp__backlog__document_search
  - mcp__backlog__milestone_add
  - mcp__backlog__milestone_list
  - mcp__backlog__task_create
  - mcp__backlog__task_edit
  - mcp__backlog__task_list
  - mcp__backlog__task_search
  - mcp__backlog__task_view
  - Bash(rm:*)
  - Bash(touch:*)
  - Bash(mktemp:*)
  - Bash(date:*)
argument-hint: "[<task-id> | <feature description> | --file <path>] [--no-codex] [--review-interactive]"
hooks:
  Stop:
    - hooks:
        - type: command
          command: |
            # Backlog-aware completion tripwire. Replaces the legacy cwd-relative
            # `find specs -name '*.md'` scan (which false-fired whenever the session was
            # rooted away from a repo's specs/ dir). The new hook checks a TMPDIR marker
            # this skill writes only after the full authoring transaction succeeds, so it
            # is never cwd-relative. Locate the script: prefer the plugin root, else the
            # newest cached copy; no-op safely if not found.
            S="${CLAUDE_PLUGIN_ROOT:-}/hooks/spec-backlog-stop.sh"
            [ -f "$S" ] || S=$(ls -t "$HOME"/.claude/plugins/cache/*/yourvid-tools/*/hooks/spec-backlog-stop.sh 2>/dev/null | head -1)
            [ -n "$S" ] && [ -f "$S" ] && bash "$S"
            exit 0
---

# Requirements Engineering Skill

Conduct structured discovery interviews to fully understand a feature before implementation. Produces specs with testable acceptance criteria and agent-sized implementation tasks that enable focused, verifiable development.

## Philosophy

**Goal:** Eliminate back-and-forth during implementation by front-loading all discovery. Every spec must answer two questions: "What does done look like?" with testable acceptance criteria, and "How do we get there?" with tasks sized for a single focused session.

**Approach:**

- Ask non-obvious questions that uncover hidden complexity
- Actively explore the codebase to ask informed, context-aware questions
- Challenge assumptions and surface concerns proactively
- Clarify ambiguity immediately rather than documenting it
- Produce testable acceptance criteria for every requirement
- Decompose implementation into agent-sized tasks with dependencies
- Continue until confident the spec enables focused, one-task-at-a-time implementation

## Usage

- `/spec <task-id>` - **Pick up an existing capture.** Read that task's spec-light brief (a captured `Needs Spec` task) and right-size it: enrich the single task in place for one-session work, or decompose for genuinely multi-task work. See Step 0.5 + Step P. The argument is treated as a task id when it matches the board's task-id shape (e.g. `task-42`, `TASK-42`); otherwise it is a free-text feature description (next line).
- `/spec Add a dark mode toggle` - Start discovery from a description (the existing from-scratch path).
- `/spec --file docs/feature-idea.md` - Start from existing rough spec
- `/spec` - Ask user to describe the feature
- `--no-codex` - Skip the Codex review pass entirely (Codex runs by default). Also the external-disclosure escape: use this when the spec must not be shared with an external model.
- `--review-interactive` - Run the same full all-severity triage as the default, but add a per-iteration apply-all / override-specific approval prompt that gates BLOCKING findings only (bypassed when there are zero BLOCKING findings).

> **Two entry modes, one skill.** A bare `/spec <description>` (or `--file`, or no arg) runs the from-scratch interview that authors a brand-new spec — **all of Steps 1→7 below, unchanged**. A `/spec <task-id>` instead **picks up** a task someone already captured (status `Needs Spec`) and right-sizes it (Step 0.5 routes it to Step P). The pickup path is **additive**: its multi-task branch reuses the very same interview, Codex review, and board-authoring machinery; its single-task branch is the only genuinely new flow (enrich-in-place, no document, no child tasks).

## Gotchas

- The Stop hook is a tripwire keyed to a TMPDIR completion marker (`claude-spec-done-*`) written only after the board-authoring transaction succeeds (warns at most once per run). It fires on every turn end while this skill is active, so **keep interview questions inside AskUserQuestion calls** — ending a turn mid-interview with a free-text question gets blocked once.
- AC IDs are load-bearing: each `FR#-AC#` is preserved verbatim in the spec **document** and as a prefix on the matching task's `acceptanceCriteria`. Positional numbering alone breaks traceability.
- The full Codex Agent prompt (wrapper + spec path + FP3) must contain **no backtick and no `$(`** — the auto-approve hook falls through silently and the subagent's Bash call stalls on a permission prompt (6.5.3). Verify the Codex plugin via the `codex:codex-rescue` agent type, never the user-only `/codex:adversarial-review` (6.5.2).
- **Pickup path (`/spec <task-id>`) status-flip ordering is load-bearing (Step P.3/P.4).** On the enrich-in-place branch, write `acceptanceCriteria` + `modifiedFiles` + `milestone` **first** and set status `Needs Spec` → `Specced` **last** — a `Specced` task without criteria or a milestone is a half-specced task `/implement` would pick up empty. On any uncertain write, reconcile via `task_view` before re-writing (never blind-retry — `commentsAppend` is not idempotent and a re-applied field could clobber one that did land). The status flip is the deliberate commit point.

## Process

> This skill authors the spec + its task decomposition on the **central Backlog board**
> (the `yourvid-ops` repo, via the `backlog` MCP server) — not as `specs/*.md` + `.tasks/`.
> See `backlog-conventions.md` (plugin root) for the full contract referenced below.
>
> Step 0.5 first chooses the **entry mode**: a bare `/spec <description>` runs Steps 1→7 to
> author a new spec (document + milestone + decomposition); a `/spec <task-id>` enters the
> **pickup path** (Step P) to right-size an already-captured `Needs Spec` task — which for a
> single-task capture enriches that one task **in place** (acceptance criteria + milestone +
> `modifiedFiles`, no document, no children) and otherwise decomposes through the same Steps
> 6→7a. Either way, **all spec state stays on the board** — no `specs/*.md`, no `.tasks/`.

### 0. Preconditions (Backlog board)

Before the interview, in this order:

1. **Re-arm the completion hook FIRST** — clear stale markers (so the Stop hook warns at
   most once this run and only passes on a fresh success). Do this **before** the MCP
   check below, so that even a hard-stop leaves no stale "done" marker the Stop hook could
   mistake for a successful run:
   ```bash
   rm -f "${TMPDIR:-/tmp}"/claude-spec-done-* "${TMPDIR:-/tmp}/claude-spec-backlog-warned"
   ```
2. **MCP precondition.** Verify the `backlog` MCP is reachable — make one cheap read
   (`mcp__backlog__get_backlog_instructions` or `mcp__backlog__task_list`). If it is NOT
   reachable (the `mcp__backlog__*` tools are absent or the call errors), **hard-stop**:
   "The `backlog` MCP server is not connected. Check `claude mcp list`; reconnect or
   restart the session so it loads, then re-invoke `/spec`." Do **not** fall back to
   writing `specs/*.md`; perform no work.

### 0.5. Pick the entry mode (pickup vs from-scratch)

`/spec` has **two** entry modes. Decide which **before** Step 1, from the argument shape:

- **Pickup mode** — the argument is a **single board task id** (matches the task-id shape,
  case-insensitively: `task-<n>` / `TASK-<n>`, optionally a decimal sub-task id like
  `task-9.1`) **and no `--file` / free-text description** accompanies it. Go to **Step P**
  (it reads that one task and right-sizes it in place or by decomposition). The `--no-codex`
  / `--review-interactive` flags still apply to Step P's **decompose** branch (which runs the
  normal review machinery); they are inert on the **enrich-in-place** branch (no document is
  authored, so there is nothing for Codex to review).
- **From-scratch mode** — anything else: a free-text description, `--file <path>`, or no
  argument at all. This is the **existing** behavior — proceed to **Step 1** and run Steps
  1→7 exactly as before. A free-text gist that merely *looks* feature-like is **not** a
  pickup, even if a `Needs Spec` task with a similar title exists.

**Never implicitly pick a task.** Pickup requires an **explicit** task id. If the
operator clearly means "spec the next captured task" but supplied **no id**, do **not** scan
`Needs Spec` tasks and choose one — there is no implicit selection among multiple captures.
Instead surface the open `Needs Spec` tasks (`mcp__backlog__task_list` filtered to the
`Needs Spec` status) so the operator can re-invoke with a specific id, and stop. (`Draft`-status
captures are a deliberately hidden inbox — see `backlog-conventions.md`; surface `Needs Spec`
tasks here, not `Draft` ones.)

### 1. Gather Initial Context

**If description provided:**

- Parse the feature description for key concepts
- Identify affected domains and potential scope

**If file provided:**

- Read the file completely
- Extract stated requirements and open questions
- Note any assumptions made

**Always:**

- Use the **Explore agent** (via Task tool with `subagent_type: Explore`) for efficient codebase analysis
- Let it find related code, patterns, conventions, and similar feature implementations

```
Task(Explore): "Find all code related to [feature area].
Identify patterns for [relevant patterns] and any existing implementations."
```

### 2. Conduct Discovery Interview

**Question Strategy:**

- Ask 2-4 related questions per batch (use AskUserQuestion tool)
- Mix product/UX and technical questions naturally
- Progress from high-level to specific as understanding develops
- Reference specific code when asking technical questions
- For each requirement, ask: "How would we verify this works?"

**Coverage Areas (ensure all are addressed):**

| Area                  | Example Questions                                                           |
| --------------------- | --------------------------------------------------------------------------- |
| **Core Requirements** | What's the minimum viable version? What's explicitly out of scope?          |
| **User Flows**        | What triggers this? What happens after? Who uses this?                      |
| **Edge Cases**        | What if the user does X? What about empty states? Errors?                   |
| **Data Model**        | What needs to be stored? What's the source of truth?                        |
| **Integration**       | What existing systems does this touch? API contracts?                       |
| **Performance**       | Expected scale? Caching needs? Real-time requirements?                      |
| **Security**          | Auth requirements? Data sensitivity? Audit needs?                           |
| **UX Details**        | Loading states? Feedback? Undo capability?                                  |
| **Verification**      | How do we know each requirement is met? What does "done" look like exactly? |

**Question Quality Guidelines:**

DO ask:

- "I see `UserPreferences` stores settings in Firestore - should dark mode live there or be client-only? What are the sync implications?"
- "The current `ThemeProvider` only handles brand colors. Should dark mode be a theme variant or a separate system?"
- "How would we verify the theme persists across sessions? Should there be a test for this?"

DON'T ask:

- "What color should the background be?" (too obvious)
- "Should it have a toggle?" (implied by feature)
- "Will users want this?" (already decided)

### 3. Surface Concerns Proactively

During the interview, actively identify and raise:

- **Architectural concerns:** "This would require changes to X, Y, Z - is that acceptable scope?"
- **Technical debt:** "The current implementation of X would make this difficult because..."
- **Edge cases:** "I notice there's no handling for X - how should that work?"
- **Tradeoffs:** "We could do A (faster, less flexible) or B (slower, more extensible) - which fits better?"
- **Dependencies:** "This depends on X which doesn't exist yet - should that be part of this spec?"

### 4. Resolve Ambiguity Immediately

When answers are unclear or contradictory:

1. State what you understood
2. Explain the ambiguity or conflict
3. Ask for clarification before proceeding
4. Do NOT document ambiguity - resolve it

Example:

> "You mentioned the toggle should be in settings, but also mentioned quick access from the header. These could conflict - should both exist, or is one the primary interaction?"

### 5. Determine Completion

The interview is complete when:

- [ ] All coverage areas have been addressed
- [ ] No unresolved ambiguities remain
- [ ] Every functional requirement has testable acceptance criteria
- [ ] Technical approach is clear
- [ ] Scope boundaries are explicit (in scope AND out of scope)
- [ ] Edge cases have defined behavior
- [ ] Implementation can be decomposed into focused, independent tasks
- [ ] You could implement any single task without asking more questions

If unsure, ask: "I think I have enough to write the spec. Is there anything else you want to cover?"

### Step P. Pickup path — right-size a captured `Needs Spec` task

> Reached **only** from Step 0.5's pickup mode (`/spec <task-id>`). Everything here is
> **additive** to the from-scratch path — Steps 1→7 are untouched for a bare `/spec
> <description>`. This step ends by either completing **in place** (single-task) or handing
> off to the normal authoring machinery (Steps 6→6.5→7a) for a **decomposition**.

#### P.1. Load the captured task as interview input

`mcp__backlog__task_view <task-id>` and read it as the **starting context** for the
interview — the captured brief replaces "Gather Initial Context" (Step 1) as the seed:

- The capture's six-section brief (**What**, **Why/trigger**, **Where**, **Background**,
  **Open questions**, **Rough scope**) lives in the task `description`. Treat **Where** as
  the affected repo + files/paths, **Open questions** as the gaps to resolve in the
  interview, and **Rough scope** as the in/out-of-scope seed.
- Note the task's existing `status` (it should be `Needs Spec`) and `labels` (a `repo:<name>`).

**Validate it is a pickup-eligible capture.** If the id resolves to **no task**, or the task
is **not** at status `Needs Spec` (it is already `Specced`/`In Progress`/`Done`, or never a
capture), **stop and report** — do not silently re-spec an already-specced task or invent a
brief for a non-capture. (`Needs Spec` is the project's pickup signal; `Specced` means "ready
for `/implement`" — see `backlog-conventions.md`.) On an MCP read error here, fail closed (stop
and report) — nothing has been mutated yet.

Then run the discovery interview (**Steps 2→5**) **seeded with the brief**: skip questions the
brief already answers, drive the interview from its **Open questions**, and apply Step 3/4
(surface concerns, resolve ambiguity). Use the same `AskUserQuestion` discipline (the Stop
hook is live).

#### P.2. Right-size: in-place vs decompose

Apply the **same sizing heuristics** as the from-scratch decomposition (the "and" test, layer
test, platform test, three-sentence rule, context-window test, file-ownership test — the table
under "Key rules for implementation decomposition"). Ask the single question those heuristics
answer: **does this brief resolve to exactly one agent-sized, single-file-owner task, or to
genuinely multiple tasks?**

- **One agent-sized task** (no heuristic forces a split — fits one focused session, one file
  owner, ACs ≤3 sentences, no layer/platform/"and" boundary crossed) → **P.3 (enrich in
  place)**.
- **Genuinely multiple tasks** (any heuristic forces a split) → **P.4 (decompose)**.

When genuinely borderline, **prefer in-place** only if it cleanly satisfies every heuristic;
otherwise decompose. Record **which heuristic** drove the call — it is written back per
P.3/P.4 (an in-place comment, or a decompose-branch Decision Log row).

#### P.3. Enrich the captured task IN PLACE (single-task)

The captured task **is** the unit of work — do **not** create a milestone-scoped document or
any child tasks. Enrich the **same** task and advance its pipeline status. Derive a **slug** for it
(kebab-case from the task title/feature) and make it unique on the board exactly as Step 6
requires (search `milestone_list` + `document_search`; numeric suffix on collision; fail
closed on a genuine query failure). A one-task spec still gets a milestone because the
board-aware skills resolve by `milestone` — a single-task milestone is the **minimal
resolution key** (see `backlog-conventions.md → Transition to milestone-keyed resolution`),
which is why the in-place path sets `milestone` even though it creates no document.

Write the enrichment in this **strict order** — content fields **first**, the status flip
**last** — via `mcp__backlog__task_edit` on the captured id. Group the content writes so the
status flip is genuinely the final mutation:

1. **`acceptanceCriteria`** — set the testable criteria (the "Key rules for acceptance
   criteria" from Step 6 apply), **each item prefixed with its `FR#-AC#` ID** (`acceptanceCriteriaSet`,
   replacing the capture's none). Even a single-task spec uses `FR1-AC1`, `FR1-AC2`, … so the
   IDs are load-bearing and traceable, exactly as a decomposed spec's are.
2. **`modifiedFiles`** — set the files this task owns in the canonical `<repo>/<path>` format
   (the repo segment is always present — see `backlog-conventions.md → Decomposition →
   tasks`). Seed from the brief's **Where**; refine to the exact files.
3. **`milestone`** — set it to the resolved slug (so `/implement`, `/review`, `/commit`
   resolve this task by milestone — `backlog-conventions.md → Selecting a spec's tasks`).
4. **Right-size decision comment** — `commentsAppend` one comment recording **that the brief
   was right-sized to in-place enrichment and which sizing heuristic drove it**
   (e.g. "single agent-sized task: one file owner, ACs fit in 3 sentences, no layer/platform
   split — enriched in place, no child tasks"). Describe the reasoning directly; do **not**
   embed any planning-layer identifier in this prose beyond the board-native `FR#-AC#` already
   on the task.
5. **Flip the status LAST** — only after 1–4 have all succeeded, `task_edit status="Specced"`
   to advance the task from `Needs Spec` to `Specced` (the existing `repo:<name>` and any
   other labels are untouched — status and labels are orthogonal in the new model). This last
   write is the commit point that marks the task ready for `/implement`.

**Mutation-order safety.** The content writes precede the status flip so that an interruption
can never leave a `Specced` task without its criteria/milestone. If any write
returns an **uncertain or partial** result (timeout / unknown outcome), **reconcile via
`mcp__backlog__task_view` before re-writing** — read the task back, compare against the
intended state, and re-issue only the missing mutations (do not blindly re-apply, which could
double-append the comment or clobber a field that did land). Only flip the status once the
content fields are confirmed present.

**No document, no children, no Codex pass.** The in-place branch authors no spec document, so
there is nothing for the Codex review (Step 6.5) to read — skip Steps 6, 6.5, and 7a entirely.
Then **report** (reuse Step 7b's shape, scaled down): name the enriched **task id**, its
**milestone** (= slug), the `FR#-AC#` criteria written, the `modifiedFiles`, the right-size
decision, and that the task is now `Specced` and ready for `/implement <slug>`. Write the Stop
hook's completion marker (Step 7a.6) once the status flip has succeeded, so the tripwire sees a
clean run.

#### P.4. Decompose (genuinely multi-task)

This is the **existing** decomposition path, entered with the captured brief carried in as the
seed. Proceed to **Step 6** and author the spec normally — milestone (= slug) + document +
child tasks — applying the full decomposition rules, then the Codex review (6.5) and the
board-authoring transaction (7a). The captured brief's **What/Why/Where/Background/Rough
scope** feed the spec's Overview / Scope / Requirements; its **Open questions** are resolved in
the interview (P.1) and must not survive as ambiguity in the spec.

Two pickup-specific rules layer onto Step 6/7a:

- **Coordination parent only for a cross-repo decomposition.** A **single-repo**
  decomposition gets **no** coordination parent (its child tasks carry the `milestone` and
  `repo:<name>` directly). Create a coordination parent **only** when the decomposition spans
  **more than one repo** — exactly the cross-repo rule in `backlog-conventions.md → Cross-repo
  decomposition`. (The lone captured task is single-repo by construction, so the common case
  has no parent.)
- **The originating captured task ends `Specced`.** The capture seeded the spec but
  is not itself an executable unit once decomposed. After the decomposition's tasks are
  authored (7a), flip the **originating** task's status from `Needs Spec` to `Specced` (same
  status flip as P.3.5) so no stray `Needs Spec` capture lingers for the same work.
  Decide its disposition: if one decomposition child fully subsumes the originating task's
  scope, you may instead fold the capture into that child (note it), but the captured task must
  **not** remain at `Needs Spec`.

- **Record the right-size decision in the document's Decision Log.** In the decompose
  branch the right-size decision is captured as a **Decision Log row** in the spec document
  (e.g. "Captured brief right-sized to a N-task decomposition — <heuristic that forced the
  split>"), **not** as a comment on the originating task. This is the decompose-branch analogue
  of P.3.4's in-place comment.

### 6. Write Specification (as a draft, for review)

Derive a **slug** from the feature name (kebab-case). Confirm it is unique on the board:
search existing **milestones** (`mcp__backlog__milestone_list`) and spec **documents**
(`mcp__backlog__document_search`) — **not** `spec:<slug>` labels, which `/spec` no longer
creates. On collision append a deterministic numeric suffix (`-2`, `-3`, …) and note it.
**Fail closed on a genuine query failure:** if either uniqueness query errors, times out,
or its completeness can't be proven, **stop and report** rather than risk a duplicate or a
wrong reconcile target. A **one-sided** state for this slug — a milestone with no document,
or a document with no milestone — is **not** a conflict: it is the resumable signature of a
prior interrupted `/spec` run, which Step 7a reconciles (create-if-absent), so **proceed**.
(If the slug already exists from a prior `/spec` run on this feature, you will **reconcile**
rather than duplicate — see Step 7a.)

Assemble the full spec markdown as a **draft** and bind the Codex-review path variable to it:

```bash
SPEC_PATH="${TMPDIR:-/tmp}/spec-draft-<slug>.md"   # the file Step 6.5 reviews; the path 6.5.3 consumes
```

Write the draft to `$SPEC_PATH` using the template below, including a `slug: <slug>` line
near the top. This **draft** is the artifact the Codex review (Step 6.5) reads and iterates
on — the per-iteration `.iter.bak` and the permanent `spec.pre-codex.<run-id>.bak` baselines
that 6.5 writes live **in TMPDIR alongside the draft**, and 6.5.5's stale-baseline cleanup
globs `"${TMPDIR:-/tmp}"/spec.pre-codex.*.bak`. The draft is **not** persisted to the board
until the review settles (Step 7a). Do **not** create `specs/<feature>.md` or any `.tasks/`
directory.

**Key rules for acceptance criteria:**

- Every AC must be testable (a human or machine can verify pass/fail)
- Use specific, measurable language ("responds within 200ms" not "is fast")
- Each AC maps to one verifiable behavior
- If you can't write a clear test for an AC, the requirement is too vague — go back and clarify
- **Explicitly ID each AC** using the format `**FR1-AC1:**`, `**FR1-AC2:**`, etc. These IDs are referenced by task decomposition (`Criteria: FR1-AC1, FR1-AC2`) and preserved on the board — verbatim in the spec **document** and as `FR#-AC#` prefixes on each task's `acceptanceCriteria` — so traceability survives. Never rely on positional numbering alone — always include the bold ID prefix

**Key rules for implementation decomposition:**

Apply these sizing heuristics to every task:

| Heuristic               | Rule                                                                | Example                             |
| ----------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| **The "and" test**      | Split tasks containing "and" or "as well as"                        | "Build API and UI" → 2 tasks        |
| **Layer test**          | Split tasks spanning frontend + backend                             | "Add field end-to-end" → 2 tasks    |
| **Platform test**       | Split tasks crossing platform boundaries                            | "iOS and Android" → 2 tasks         |
| **Three-sentence rule** | If ACs need >3 sentences, decompose further                         | Complex validation → separate tasks |
| **Context window test** | Ask: "Can a fresh agent complete this without prior session state?" | If no → split into smaller tasks    |
| **TDD test**            | If you can't write clear test cases for it, it's too vague          | Vague task → clarify or split       |
| **File ownership test** | No two independent tasks should modify the same file                | Shared file → assign to one task    |

### Spec Template

```markdown
# Feature: <Name>

> One-line summary of what this feature does

## Overview

Brief description of the feature, its purpose, and value to the user.

## Scope

### In Scope

- Specific capability 1
- Specific capability 2

### Out of Scope

- Explicitly excluded capability 1
- Explicitly excluded capability 2

## Requirements

### FR1: <Requirement Name>

<Brief description of what this requirement entails>

**Acceptance Criteria:**

- [ ] **FR1-AC1:** <Specific, testable criterion>
- [ ] **FR1-AC2:** <Specific, testable criterion>
- [ ] **FR1-AC3:** <Specific, testable criterion>

### FR2: <Requirement Name>

<Brief description>

**Acceptance Criteria:**

- [ ] **FR2-AC1:** <Specific, testable criterion>
- [ ] **FR2-AC2:** <Specific, testable criterion>

### Non-Functional Requirements

#### NFR1: Performance

**Acceptance Criteria:**

- [ ] **NFR1-AC1:** <Measurable performance criterion, e.g., "API responds within 200ms at p95">

#### NFR2: Security

**Acceptance Criteria:**

- [ ] **NFR2-AC1:** <Verifiable security criterion, e.g., "Input is sanitized before database insertion">

## User Experience

### User Flows

1. **Primary Flow:** Step-by-step description
2. **Alternative Flow:** ...

### UI States

- **Default:** ...
- **Loading:** ...
- **Empty:** ...
- **Error:** ...

### Edge Cases

| Scenario | Expected Behavior |
| -------- | ----------------- |
| ...      | ...               |

## Technical Design

### Affected Components

- `path/to/file` - Description of changes
- `path/to/component` - Description of changes

### Data Model Changes

// New or modified structures

### API Changes

- `POST /api/feature` - Description

### Dependencies

- Existing: List of existing code this depends on
- New: Any new dependencies required

## Implementation Decomposition

> Tasks are sized for a single focused agent session. Each task has clear
> acceptance criteria, explicit dependencies, and a bounded scope.
>
> **Sizing rules applied:**
>
> - No task contains "and" connecting distinct work items
> - No task spans multiple architectural layers
> - Each task's acceptance criteria fit in 3 sentences or fewer
> - Each task is completable with fresh context (no prior session state needed)
> - No two independent tasks modify the same file (file ownership is exclusive)

### T1: <Name>

- **Description:** <1–2 sentences on what this task does — becomes the task's board `description`>
- **Depends on:** none
- **Criteria:** FR1-AC1, FR1-AC2
- **Files owned:** `path/to/file.ts`, `path/to/test.ts`

### T2: <Name>

- **Description:** <what this task does>
- **Depends on:** T1
- **Criteria:** FR2-AC1, FR2-AC2
- **Files owned:** `path/to/other.ts`

### T3: <Name>

- **Description:** <what this task does>
- **Depends on:** T1
- **Criteria:** FR3-AC1
- **Files owned:** `path/to/another.ts`

### Dependency Overview

T1 → T2 → T4
↘ T3 ↗

## Testing Notes

> Unit tests derive directly from the acceptance criteria above.
> This section covers integration and manual testing only.

### Integration Tests

- [ ] End-to-end scenario 1
- [ ] End-to-end scenario 2

### Manual Testing

- [ ] Manual verification scenario 1
- [ ] Manual verification scenario 2

## Decision Log

| Decision       | Rationale  | Date   |
| -------------- | ---------- | ------ |
| Chose X over Y | Because... | <date> |
```

### 6.5. Codex Review (Default-On)

After the spec file is written but before the final report, run a Codex adversarial review pass **by default**. Codex is a cross-model reviewer (different training-induced biases than Claude) that catches blind spots a same-model reviewer misses. The review itself is read-only — Codex never modifies the spec; only this skill rewrites it, and only after snapshotting (see 6.5.5).

#### 6.5.1. Run Codex by Default (`--no-codex` to skip)

Codex runs automatically — there is **no** "run Codex?" prompt. Proceed straight to 6.5.2 unless the user passed `--no-codex`.

- If `--no-codex` was passed: this is a **SOFT skip** (Codex never runs, so the spec is never at risk) — skip the entire Codex pass and proceed directly to Step 7. The spec file is unchanged. `--no-codex` is also the **external-disclosure escape**: the Codex pass forwards the spec to a cross-model (external) reviewer, so use `--no-codex` whenever the spec must not leave the local model boundary.
- Otherwise: continue to 6.5.2.

#### 6.5.2. Verify Codex Plugin Installed

Before invoking Codex, verify the `openai/codex-plugin-cc` plugin is installed by checking that the `codex:codex-rescue` agent type is available (it is listed among the Agent tool's available agent types) or that any `codex:*` skill (e.g. `codex:setup`) appears in the available-skills list. **Do NOT probe for `/codex:adversarial-review`**: it carries `disable-model-invocation: true` upstream, which removes it from the model-visible command list entirely — that check false-negatives even when the plugin IS installed. The skill itself invokes Codex via the `codex:codex-rescue` agent (see step 6.5.3), so agent-type availability is the direct, reliable signal.

Plugin-missing is its own outcome — a **PRECONDITION HALT**, distinct from both the soft skips and the fail-closed path. There are exactly three non-CLEAN/non-FINDINGS dispositions across the Codex pass: **precondition-halt** (plugin-missing — stops here with install instructions and does NOT proceed to Step 7); **soft-skip-proceed** (`--no-codex` in 6.5.1 or path-validation fail in 6.5.3 — these DO proceed to Step 7 because Codex never ran, so the spec was never at risk); and **fail-closed** (6.5.4 — Codex RAN and then errored). Plugin-missing is NOT a soft skip: reserve the SOFT-skip label only for `--no-codex` and path-validation fail. The spec stays exactly as Step 6 wrote it. Because a missing plugin means the review was never even attempted, halt with this exact message and stop the skill so the user can install the plugin and get a real review (the spec file is preserved on disk as-written; Step 7 does NOT run):

```
Codex plugin not installed. Install: /plugin marketplace add openai/codex-plugin-cc → /plugin install codex@openai-codex → /reload-plugins. Then re-invoke /spec.
```

The user can install the plugin and re-invoke `/spec` from scratch; the existing spec will be detected and re-reviewed.

#### 6.5.3. Invoke Codex with Focus Prompt FP3

Spawn the `codex:codex-rescue` agent via the `Agent` tool with `subagent_type: "codex:codex-rescue"` and **no** `run_in_background` (foreground/synchronous). The Agent prompt has four parts in order: a `--wait` routing handle line, an explicit read-only directive sentence, a spec-path prefix line, then the FP3 focus prompt verbatim.

**Pre-spawn validation (FR3-AC6)**: before constructing the Agent prompt, validate that the resolved spec path contains neither a backtick character nor the `$(` substring. The validation must actually gate the Agent spawn — set a flag, then skip the rest of step 6.5.3 on failure:

```bash
SPEC_OK=1
case "$SPEC_PATH" in
  *'`'*|*'$('*)
    echo "Codex spec review: ⚠️ Failed: spec path contains hook-incompatible characters: $SPEC_PATH"
    SPEC_OK=0
    ;;
esac
```

If `SPEC_OK=0`, this is a **SOFT skip** (6.5.2's disposition list) — Codex was never invoked, so the spec was never at risk: skip the rest of 6.5.3 and proceed directly to Step 7 with the spec preserved exactly as Step 6 wrote it. If `SPEC_OK=1`, spawn the Agent:

```
Agent({
  subagent_type: "codex:codex-rescue",
  description: "Codex adversarial spec review",
  prompt: "--wait

This is a read-only review pass. Do not modify the spec or any other files; only report findings.

The spec to review is at <spec-path> (the file written by Step 6).

<FP3 focus prompt — verbatim, see below>"
})
```

Foreground/synchronous (no `run_in_background`) is required — the auto-iterate loop (6.5.4–6.5.6) needs findings inline; backgrounding would block it. The spec path is embedded because the agent takes free-text input; Codex may read referenced code to ground its review but cannot modify it. The `--wait` handle (stripped by the codex-rescue agent's `codex-cli-runtime` skill) forces the agent's foreground branch — defensive-redundant under a foreground Agent call, but safe if its heuristic ever leans `--background`. The read-only directive selects the review-without-edits branch (skips `--write`); the sandbox defaults to `read-only` regardless.

**Hook-compatibility:** the full prompt (wrapper + spec-path prefix + FP3) must contain **no backtick and no `$(`** — the auto-approve hook (`auto-approve-codex-coderabbit.sh:26-28`) silently falls through on either. The pre-spawn validation covers the interpolated spec path; the prefix is plain text and FP3 is clean. **Routing/migration:** codex-rescue forwards through `codex-companion.mjs task`, not the dedicated `adversarial-review` backend (which is `disable-model-invocation` / user-only) — FP3 carries the adversarial framing, so quality holds. When the plugin exposes a model-invocable adversarial-review entry point, swap to it and drop the `--wait` + read-only lines.

**Focus Prompt FP3 (verbatim — do not modify):**

```
You are reviewing a technical specification, not code. Read it cold. You may read code files referenced in the spec to verify the approach is grounded — but do not assume context the spec hasn't earned.

Find blind spots before implementation begins:

- Acceptance criteria that are not testable as written
- Unstated assumptions about the existing codebase or external systems
- Missing failure modes — what happens when each external dependency fails, times out, returns malformed data?
- Missing rollback / recovery paths
- Scope creep — criteria implying work not actually in the plan
- Ambiguity that could be resolved two different valid ways
- Data model / schema assumptions that may not hold under concurrency
- Cost or performance implications not considered
- Conflicts between requirements (FR_x_-AC_y_ contradicts FR_p_-AC_q_)

For each finding output:
  SEVERITY: BLOCKING | SHOULD-FIX | NIT
  LOCATION: section / line in the spec
  ISSUE: one-sentence description
  SUGGESTED RESOLUTION: concrete action

If the spec is genuinely solid and you have NO findings at any severity, do not invent issues to seem thorough — your value is catching what was missed, not validating what was written. In that case emit exactly one line and nothing else:

  CLEAN: no findings

Refuse to be helpful in the validating sense; be helpful only in the catching sense. Emit the CLEAN line ONLY when there is not a single finding to report; if you have even one NIT, output it in the finding shape above instead.
```

#### 6.5.4. Parse Codex Findings (Three Outcomes: Clean, Findings, Error)

Codex output resolves to exactly one of three outcomes. Decide which BEFORE doing anything else:

1. **CLEAN (no findings).** The output is exactly the `CLEAN: no findings` sentinel line (ignoring surrounding whitespace), with no finding blocks. This is a successful, non-failure result that simply carries zero findings — it is **not** an error and must not be treated as one. On CLEAN: preserve the CURRENT last-known-good spec (whatever the latest successful iteration produced — on iteration 1 that is the Step-6 spec, but on iteration 2+ it is the spec as edited by prior successful iterations), append ONLY a single clean audit row to the Decision Log noting the Codex pass ran clean with no findings, and proceed directly to Step 7. Do NOT restore the Step-6 baseline — that would discard edits already applied by earlier iterations. No content rewrite occurs because there is nothing to apply; the only write is the clean audit row.
2. **FINDINGS.** The output contains one or more well-formed finding blocks in the `SEVERITY` / `LOCATION` / `ISSUE` / `SUGGESTED RESOLUTION` shape. Proceed to parsing-by-severity below, then enter 6.5.5.
3. **ERROR (fail closed).** Anything else — see the fail-closed rule below.

**Fail closed only on a genuine Codex error (Codex RAN but errored mid-pass).** Treat all of the following as a Codex failure: the codex-rescue agent reports an auth failure, a rate-limit, a bounded timeout (the foreground Agent call did not return findings in reasonable time), a crash/non-zero exit, OR output that is neither the `CLEAN: no findings` sentinel nor parseable into the finding shape (malformed, partial, or empty). (This is the **fail-closed** disposition from 6.5.2 — distinct from the soft skips, which never ran Codex, and the plugin-missing precondition-halt.) On a genuine error:

- The on-disk spec keeps its **last-known-good content**: no Codex-driven rewrite happens for THIS (failed) iteration. Do **not** apply any partial findings from the failed pass. Any edits already committed by PRIOR successful iterations remain — only the failed iteration's work is discarded.
- If a per-iteration recovery snapshot was taken for this iteration (see 6.5.5), the failed iteration produced no rewrite to roll back; the on-disk spec is already the canonical, un-rewritten-this-iteration version. Leave this run's permanent pre-Codex baseline (`spec.pre-codex.<run-id>.bak`, see 6.5.5) untouched.
- Appending a **single Decision-Log failure row** is an allowed bookkeeping write (it is not a Codex-driven content rewrite): record one row noting the Codex pass failed (name the failure mode if known) and that the spec was left at its last-known-good content.
- Tell the user the Codex review failed (name the failure mode if known) and that they can retry `/spec` or re-run with `--no-codex` to skip the Codex pass. Do **not** proceed to Step 7, and do **not** auto-apply, on a genuine error.

Only on the FINDINGS outcome, parse the output by `SEVERITY` tag:

- **BLOCKING** — drives the auto-iterate loop (6.5.5)
- **SHOULD-FIX** and **NIT** — triaged in 6.5.5 (mechanical → auto-applied; decision-bearing → escalated) and reported; they do NOT by themselves trigger another Codex iteration

Whenever Codex returns findings (any severity), enter 6.5.5 and run the **full triage** over ALL of them — including when there are zero BLOCKING findings (only SHOULD-FIX/NIT). The triage (auto-apply mechanical, escalate decision-bearing) must complete before Step 7 can begin; do not shortcut straight to Step 7 just because nothing was BLOCKING.

#### 6.5.5. Triage + Auto-Iterate on BLOCKING Findings

Enter this step whenever Codex returns any findings (BLOCKING, SHOULD-FIX, or NIT). The auto-iterate loop is bounded by a hard cap of **3 total Codex iterations** (initial pass + up to 2 re-runs). Track the current iteration number (`iter = 1` for the initial pass). Only **BLOCKING** findings drive additional iterations — auto-applied SHOULD-FIX/NIT changes do NOT by themselves trigger another Codex run.

**Two distinct snapshots — do not conflate them.** The loop needs two different things: a permanent diff baseline that survives every iteration, and a per-iteration rollback point that may be overwritten.

- **Permanent pre-Codex baseline (run-unique; capture ONCE, never overwrite within the run).** Before the first iteration applies or escalates anything, copy the Step-6-as-written spec to a run-unique sibling `spec.pre-codex.<run-id>.bak` (`<run-id>` = a per-run timestamp/UUID fixed at the run's start). This is the frozen state Step 7 diffs the cumulative applied changes against — created exactly once and **never** overwritten or reused for later iterations of the same run. At the **start** of each run, first delete any stale `spec.pre-codex.*.bak` from prior runs; the run-unique name then guarantees Step 7 always diffs against THIS run's baseline, never another's.
- **Per-iteration recovery snapshot (may be overwritten).** Before applying or escalating any finding *within an iteration*, take a separate rollback snapshot of the current spec — a distinct path from the permanent baseline (e.g. `<spec>.iter.bak`) **or** an in-memory record of the current full contents. Overwriting this per-iteration snapshot from one iteration to the next is fine; it exists only to recover the current iteration's pre-rewrite state, not to serve as the Step 7 diff baseline.

Do not auto-apply anything in an iteration until both the permanent baseline (on iteration 1) and that iteration's recovery snapshot exist. Keep the two paths separate so the per-iteration snapshot can never clobber the permanent pre-Codex baseline.

**Default behavior is automatic triage** (this subsection). If the user passed `--review-interactive`, use the interactive flow in 6.5.5-INT instead; the iteration mechanics (cap, exit conditions, one-row-per-iteration Decision Log) are identical either way.

For each iteration:

**A. Triage every finding into MECHANICAL or DECISION-BEARING.** Classify each finding from this iteration's Codex output (across all severities):

- **MECHANICAL / clarifying** — the finding has a single sensible resolution that does not require a product choice: an acceptance criterion that is untestable as written (reword to be testable), a missing edge case with one obvious expected behavior, naming/consistency fixes, or an ambiguity that resolves only one reasonable way. These are **auto-applied**.
- **DECISION-BEARING** — the finding requires a product/design choice, conflicts with a decision already recorded in the spec or its Decision Log, or expands scope. These are **NOT auto-applied**; they are surfaced to the user for an explicit decision (step C).

When a finding is genuinely borderline, treat it as DECISION-BEARING and escalate — never silently make a product call.

**B. Auto-apply the MECHANICAL findings and report them.** Apply the mechanical findings' resolutions directly to the spec (both snapshots already taken above). For each, derive the concrete edit from the finding's `ISSUE` and `SUGGESTED RESOLUTION`. Preserve the existing structure and prior content unless the finding's resolution explicitly changes it. Report each auto-applied change to the user (the per-finding restatement plus where in the spec it landed); the cumulative diff against this run's **permanent pre-Codex baseline** (`spec.pre-codex.<run-id>.bak`) is included in the final report (Step 7). Auto-applied SHOULD-FIX/NIT are reported but, on their own, do NOT cause another iteration.

**C. Escalate the DECISION-BEARING findings for an explicit decision.** If any DECISION-BEARING findings exist this iteration, render them as a single block — `SEVERITY`, `LOCATION`, `ISSUE`, `SUGGESTED RESOLUTION` (verbatim) plus a ≤2-sentence plain-English statement of the decision required — then ask the user how to resolve them. Use `AskUserQuestion`; for each escalated finding the user either supplies a decision (which you then apply via a focused, finding-scoped rewrite) or declines/overrides it (recorded, not applied). Derive the actual spec edit from the user's decision, not from Codex's resolution verbatim.

Severity governs what happens to a finding the user neither resolves nor overrides. Iteration and cap handling are scoped EXCLUSIVELY to unresolved **BLOCKING** findings: an unresolved BLOCKING DECISION-BEARING finding remains un-addressed and feeds the clean-exit check (F) / cap handling (6.5.6). Unresolved **SHOULD-FIX / NIT** findings — including escalated DECISION-BEARING ones at those severities — are simply **REPORTED** (carried into the iteration summary row and the Step 7 report) and never iterate or count against the cap; a non-BLOCKING escalation left open does NOT keep the loop alive.

ESC / dismissing this escalation prompt interrupts cleanly: the spec file state on disk is preserved as last written (mechanical auto-applies from step B stay; both the permanent pre-Codex baseline and this iteration's recovery snapshot remain for recovery); the loop ends; Step 7 does NOT run; no rollback.

**D. Apply decisions from C.** Apply the user's decisions (focused, finding-scoped rewrites) to the spec file. Preserve existing structure and prior content unless a decision explicitly changes it. Overridden / declined findings are not applied; if Codex re-surfaces an overridden finding on a later iteration, drop it silently — it is user-acknowledged.

**E. Add ONE iteration summary row to the Decision Log (single generalized format for BOTH flows).** Record exactly one row per iteration (NOT one row per finding). This one-row-per-iteration format is the canonical summary shape referenced by BOTH the default automatic-triage flow (this subsection) and the interactive flow (6.5.5-INT); it carries an applied/addressed count, an escalated count, and an overridden count so it fits either flow:

- **Decision:** `Codex iteration <N>: <X> applied/addressed, <Y> escalated, <Z> overridden` — where `<X>` is mechanical auto-applies in the default flow and BLOCKING findings addressed via re-interview in the interactive flow; `<Y>` counts decision-bearing findings escalated to the user (in the interactive flow the BLOCKING approval gate replaces escalation for BLOCKING findings, so `<Y>` there counts only non-BLOCKING decision-bearing escalations); `<Z>` counts overridden/declined findings
- **Rationale:** `<one-line summary of what changed in the spec this iteration>`
- **Date:** today's date

**F. Evaluate clean-exit FIRST — before touching the iteration cap.** Determine whether any **UNADDRESSED BLOCKING** finding remains after this iteration's auto-applies (B) and decisions (D). A BLOCKING finding is "addressed" if it was auto-applied as mechanical, resolved by a user decision, or overridden/declined. The loop exits cleanly and proceeds to Step 7 when ANY of:

- Codex returned no BLOCKING findings on the current iteration (mechanical SHOULD-FIX/NIT may have been auto-applied — that is fine), OR
- Every BLOCKING finding on the current iteration was auto-applied, resolved, and/or overridden, leaving none un-addressed.

If clean-exit holds, STOP here and go to Step 7 — do **not** increment or check the cap, even on the 3rd iteration. This ordering is what makes a 3rd iteration that leaves zero unaddressed findings a clean exit rather than cap-reached handling. The full iteration history (one summary row per iteration) is captured in the Decision Log per E.

**G. Only if UNADDRESSED BLOCKING findings remain: increment and check the cap.** Reaching this step means clean-exit (F) did NOT hold — at least one BLOCKING finding is still un-addressed. `iter += 1`. If `iter > 3` (i.e. unaddressed BLOCKING findings still remain after iteration 3), jump to 6.5.6 (cap-reached handling). Otherwise re-invoke Codex on the updated spec to re-verify the just-addressed BLOCKING findings and surface any remainder (repeat 6.5.3 → 6.5.4 → 6.5.5). Auto-applied SHOULD-FIX/NIT alone never drive a re-run or cap-reached handling — only unaddressed BLOCKING findings do.

#### 6.5.5-INT. Interactive Override Flow (`--review-interactive` only)

When the user passed `--review-interactive`, run the **same full all-severity triage as the default flow** (6.5.5.A classification into MECHANICAL vs DECISION-BEARING, then auto-apply the mechanical findings and escalate the decision-bearing ones across ALL severities) — `--review-interactive` does NOT narrow the review to BLOCKING. The ONLY thing this mode adds is a per-iteration **apply-all / override-specific approval gate that applies ONLY to BLOCKING findings**; that gate is described in step A below and replaces, for BLOCKING findings only, the default's silent auto-apply / escalate handling.

Non-BLOCKING findings (SHOULD-FIX / NIT) are handled exactly as in the default flow regardless of the gate: mechanical ones are auto-applied (6.5.5.B), decision-bearing ones are escalated (6.5.5.C), and any left unresolved are REPORTED without iterating (per 6.5.5.C's severity rule). They never feed the approval gate and never iterate.

**Zero-BLOCKING bypass:** when this iteration's Codex output contains zero BLOCKING findings, BYPASS the step-A approval prompt entirely (it would otherwise interpolate `N = 0` and render an undefined prompt). Jump straight to applying the mechanical / escalating the decision-bearing non-BLOCKING triage above, then the iteration summary row (E), clean-exit (F) — which holds immediately, since no BLOCKING findings remain — and on to the report. Only run step A when at least one BLOCKING finding exists.

Both snapshots (the permanent pre-Codex baseline captured once before iteration 1, and the per-iteration recovery snapshot taken before any rewrite), the generalized one-row-per-iteration Decision Log summary (6.5.5.E, the single format shared by both flows), the clean-exit evaluation (6.5.5.F), and the increment + cap check (6.5.5.G) still apply unchanged — including the rule that clean-exit (F) is evaluated BEFORE the cap is incremented or checked (G). Iteration and the cap remain driven by unresolved BLOCKING findings only.

**A. Bulk-render BLOCKING findings + single approval prompt (only when ≥1 BLOCKING finding; otherwise skipped per the zero-BLOCKING bypass above).** Render ALL BLOCKING findings from this iteration's Codex output as a single block before prompting. (The non-BLOCKING findings are triaged separately per the intro — they are not part of this BLOCKING-only gate.)

For each finding, show:

- `SEVERITY`, `LOCATION`, `ISSUE`, `SUGGESTED RESOLUTION` (verbatim from Codex)
- `Proposed change`: a ≤2-sentence plain-English restatement of `SUGGESTED RESOLUTION` (or the verbatim resolution text when it already reads as a clear actionable change). This is a **preview** of what the targeted re-interview (step C) will work toward on the `apply all` path — NOT a separately-applied edit. The re-interview remains the ground truth for the actual spec change.

Then issue exactly **one** `AskUserQuestion` with:

- Question text: `Apply Claude's proposed fixes for all N BLOCKING findings, or override specific ones?` — interpolate `N` to the count of BLOCKING findings in this iteration.
- Option 1: label `apply all (Recommended)`, description `Targeted re-interview + spec rewrite runs for every finding.`
- Option 2: label `override specific`, description `List overrides in notes with rationale, e.g.: Override #2 (auth probe sentinel is intentional); Override #5 (cache key already includes mtime).`

Branching:

- On `apply all`: every BLOCKING finding is treated as `address`. Skip step B and proceed directly to step C with the full finding set.
- On `override specific`: parse the notes field per step B; B routes the parsed split (overrides → log; remaining → step C).

ESC at this AskUserQuestion interrupts cleanly: the spec file state on disk is preserved as last written; the loop ends; Step 7 does NOT run; no rollback.

**B. Parse overrides from notes; record them in the Decision Log.** This step runs only on the `override specific` branch from A.

**Canonical override pattern**: `Override #<N> (<rationale>)`

- Case-insensitive on the literal `Override` (matches `override`, `OVERRIDE`, etc.).
- Parentheses around the rationale are **required**. Bare `Override #N` (no parens) or `Override #N my reason` (no parens around rationale) is malformed — see edge cases below.
- Rationale text inside the parens may contain any Unicode (em-dashes, smart quotes, semicolons inside the parens are permitted — only semicolons / newlines **outside** parens act as separators).
- Multiple overrides per notes field are separated by semicolons OR newlines that fall outside any parenthesized rationale.

Overridden findings feed into this iteration's single summary row (6.5.5.E) as part of the `<Z> overridden` count and the rationale summary — do NOT add a separate Decision Log row per override. Findings NOT mentioned in the override list are routed to step C as if `address` had been chosen for them. Overridden findings do NOT re-iterate and MUST NOT re-appear in the next iteration's BLOCKING set (if Codex re-surfaces them, drop them silently — they are user-acknowledged).

**Edge cases (notes-field handling):**

- **Empty notes (or whitespace-only):** show a one-line clarification — `override specific requires you to list which findings to override and the rationale — re-prompting` — and re-run the same `AskUserQuestion` from step A once. If the user submits empty notes again, fall back to `apply all` (proceed to step C with all findings as addressed); the fallback is reflected in this iteration's summary row rationale.
- **Free prose with no canonical entries** (e.g., `I disagree with the Codex review` — no `Override #N (...)` matches at all): treat as ambiguous; re-prompt once with the canonical format example. Repeat ambiguity → fall back to `apply all` per the empty-notes mechanism (noted in the iteration summary row rationale).
- **References to finding numbers that don't exist** (e.g., `Override #99` when only 5 findings were rendered): log a warning visible to the user inline (e.g., `Warning: Override #99 ignored — only 5 findings in this iteration.`), and skip that entry. Other valid entries process normally.
- **All findings overridden** (parsed override count equals total BLOCKING findings in this iteration): skip step C entirely (no findings remain to address). The iteration summary row records `0 applied/addressed, <N> overridden` (generalized 6.5.5.E format). The loop exits per the clean-exit evaluation in condition F (no unaddressed BLOCKING findings remain).

**C. Targeted re-interview (only if at least one finding is being addressed).** Run a focused interview round asking ONLY questions related to the addressed findings — do not re-interview the whole spec. The questions should be derived directly from each addressed finding's `ISSUE` and `SUGGESTED RESOLUTION`.

**Merge semantics — question-keyed:** this round's answers supersede prior answers for the same question (replace, never append). Questions not re-asked carry forward unchanged from prior rounds. A new answer for question Q replaces the old answer for Q; answers for questions not asked in this round are preserved as-is.

Skip step C entirely when the user picked `override specific` and overrode every BLOCKING finding (see step B's all-overridden edge case) — proceed to the iteration summary row with `0 applied/addressed`. The loop will exit per the clean-exit evaluation in condition F (no unaddressed BLOCKING findings remain).

**D. Re-write the spec.** Apply the new answers from the targeted re-interview (and any overrides from B) to the spec file, together with the non-BLOCKING triage edits from the intro (mechanical SHOULD-FIX/NIT auto-applies and any applied decision-bearing non-BLOCKING resolutions). Preserve the existing structure and prior content unless the new answers explicitly change it.

Then continue with 6.5.5.E–G exactly as in the default flow: the single generalized summary row (its `applied/addressed` count is the BLOCKING findings addressed via re-interview, with non-BLOCKING auto-applies folded into the rationale), then clean-exit evaluation, then — only if unaddressed BLOCKING findings remain — increment + cap check.

#### 6.5.6. Cap-Reached Handling (3 iterations exhausted with un-addressed BLOCKINGs)

This step is reached only via 6.5.5.G — i.e. clean-exit (6.5.5.F) did NOT hold and unaddressed BLOCKING findings still remain after iteration 3. (If iteration 3 left zero unaddressed BLOCKING findings, the loop already exited cleanly at F and never reached here.) Surface ALL remaining un-addressed BLOCKINGs to the user — including BLOCKING DECISION-BEARING findings left unresolved (unresolved SHOULD-FIX/NIT are reported per 6.5.5.C, not handled here) — and use `AskUserQuestion` with the question: `3-iteration cap reached. Address remaining manually (exit /spec, edit spec, re-invoke) or override remaining now?` and exactly two options:

- `address-manually-and-exit` — record a Decision Log entry noting cap reached and user opted for manual address; end the loop; do NOT proceed to Step 7. The spec file is left on disk (with the permanent pre-Codex baseline alongside it); the user can edit it directly and re-invoke `/spec` later if desired.
- `override-remaining` — capture rationale via the AskUserQuestion notes; record ONE Decision Log summary row for the cap-override (counts of findings overridden plus the rationale, consistent with the one-row-per-iteration convention — not one row per finding); end the loop; proceed to Step 7.

### 7. Persist to the board, then report

The Codex pass (6.5) has settled (a clean exit, or it was skipped via `--no-codex`). The
final reviewed content lives in the TMPDIR draft. Now persist it to the central Backlog
board (7a), then report (7b).

#### 7a. Persist to the central board

Re-check the MCP precondition (Step 0.2) — hard-stop on failure (nothing has been
persisted yet). Then, per `backlog-conventions.md`, **create-if-absent / reuse** each
resource (never duplicate):

1. **Reconcile-by-slug (idempotency).** Search the board for the existing spec:
   `mcp__backlog__document_search` for the document, and `mcp__backlog__task_list` with the
   **`milestone` filter** (`milestone=<slug>`) for its tasks — **not** the `spec:<slug>`
   label (no longer created). Record which document / milestone
   exist and the **set of task titles already present** — the task **title** is the stable
   per-task key within a slug. **Fail closed:** if the task lookup errors, times out, or its
   paging completeness can't be proven, **stop and report** (a partial read would mis-judge
   which tasks already exist and could create duplicates); likewise **stop** if more than one
   distinct task already carries this exact `milestone` in a way that can't be reconciled by
   title (under the single-operator assumption a true duplicate milestone is a conflict, not
   a merge). Steps 2–4 then branch on this.
2. **Document:** if no document for this slug exists, `mcp__backlog__document_create`
   (`title` = feature name, `content` = the reviewed draft — it carries the `slug:` line +
   verbatim `FR#-AC#` IDs). If one exists, **reuse** it.
3. **Milestone:** if the `<slug>` milestone is absent, `mcp__backlog__milestone_add`
   (`name` = slug); else **reuse** it.
4. **Tasks (two-pass, create-only-missing).** Pass 1 — for each decomposition task whose
   **title is not already on the board** (from step 1), `mcp__backlog__task_create` with
   `title`, `description`, `status` = `Specced` (the spec is settled — its tasks enter the
   pipeline ready for `/implement`), `milestone` = slug (**the canonical work-unit key, set on every
   task**), `labels` = `repo:<name>` on **every executable task** (the repo its
   `modifiedFiles` live in) and **none** on the coordination parent — **no `spec:<slug>`
   label on anything**, `acceptanceCriteria` = the assigned criteria each prefixed with its
   `FR#-AC#` ID, `priority`, `modifiedFiles` in `<repo>/<path>` format, and `parentTaskId`
   for cross-repo children; collect the assigned IDs (reuse discovered IDs for tasks that
   already exist). For a cross-repo spec, create the **coordination parent first** (carries
   the `milestone`, no acceptance criteria, no `repo:` label) so children can reference it,
   then the per-repo **executable children** (each `Specced` and labelled `repo:<name>`). Pass 2 — set each
   task's `dependencies` by resolved ID via `mcp__backlog__task_edit`.
5. **Partial failure:** if a create/edit fails partway, report the IDs already created (the
   run is resumable — a re-run reconciles by slug + title) and STOP — do **not** write the
   completion marker.
5b. **Pickup-originating task (decompose-from-pickup only).** When this transaction was entered
   via the pickup path's decompose branch (Step P.4) — i.e. an existing captured task seeded
   this spec — flip that **originating** task **after** its decomposition tasks exist: set its
   status from `Needs Spec` to `Specced` (its `repo:<name>` label is untouched), so no
   stray `Needs Spec` capture lingers for work now owned by the decomposition. If an uncertain
   write leaves its state unclear, reconcile via `mcp__backlog__task_view` before re-writing.
   (The from-scratch path has no originating task and skips this.)
6. **Completion marker** — ONLY after the whole transaction (document + milestone + all
   tasks + all dependencies, plus the pickup-originating flip in 5b when applicable) succeeds,
   write the marker the Stop hook checks. Verify the
   `touch` **succeeded** before deleting the draft, and delete only **this run's** draft (by
   its exact `$SPEC_PATH`), never the `spec-draft-*` glob (which would clobber other runs'
   recovery drafts):
   ```bash
   if touch "${TMPDIR:-/tmp}/claude-spec-done-$(date +%s)-$$"; then
     rm -f "$SPEC_PATH"
   else
     echo "WARNING: the board is authored but the /spec completion marker could not be written; the Stop hook may re-prompt. Draft kept at $SPEC_PATH."
   fi
   ```

#### 7b. Report

Deliver a **report** — a summary, not a gate. Do not block for approval; the spec is on
the board.

1. The created **document**, **milestone** (= the slug), and **task IDs**.
2. Key decisions made (incl. which Codex findings were auto-applied, escalated, and how the user resolved them).
3. Constraints / tradeoffs accepted.
4. If a Codex pass auto-applied changes, the **applied-change diff** against this run's permanent pre-Codex baseline (`spec.pre-codex.<run-id>.bak`) — the cumulative effect of every iteration.
5. The decomposition + dependency order.
6. That the user can refine on the board before running `/implement <slug>` — no confirmation required to finish.

## Error Handling

**User wants to skip questions:**

- Explain that incomplete specs lead to rework
- Offer to make reasonable assumptions and document them
- Continue with documented assumptions if user insists

**Feature is too large:**

- Suggest breaking into multiple specs
- Identify natural boundaries for phasing
- Create a separate spec per phase (each its own board document + milestone)

**Contradictory requirements:**

- Stop and surface the conflict immediately
- Do not proceed until resolved
- Document the resolution in Decision Log

**Cannot write testable acceptance criteria:**

- The requirement is too vague — ask clarifying questions
- If user can't clarify, note it as a risk and write the best AC possible
- Flag it in the Decision Log

## Tips

- Reference specific code when asking questions - shows you understand the codebase
- Ask "why" to uncover requirements behind requested solutions
- Watch for implied requirements that user assumes are obvious
- For each requirement, mentally ask "how would I test this?" to drive AC quality
- Consider the user who will maintain this code in 6 months
- When decomposing tasks, imagine handing each to a developer who knows nothing about this feature

## Related Skills

- `/implement <slug>` executes the task decomposition (direct, sub-agents, or Agent Teams).
- `/review` (code review + AC verification), `/commit` (plain-prose bodies from board context), and `/review-pr` (PR + bot reviews + board-sourced traceability) each resolve this spec from the board — see `backlog-conventions.md → ## Board awareness for /review, /commit, and /review-pr`.
