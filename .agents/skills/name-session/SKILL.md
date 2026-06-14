---
name: name-session
description: Suggest a fitting name for the CURRENT Claude Code session, drawn from the in-context conversation, so you can label it before closing and find it again in the resume picker. Prints a ranked list of short kebab-case candidates, each with a ready-to-paste /rename line — it suggests, you apply. Use when wrapping up a session or whenever you ask to "name this session", "suggest a name for this session", "rename this session", or "what should I call this session". Reads only the conversation already in context — no tools, no board, no files.
argument-hint: "[<hint>]"
---

# Session Name Suggester Skill

Propose a fitting name for the **current** Claude Code session, distilled from the conversation so far, so you can label it before closing and find it again later. Claude Code session names are real: `/rename <name>` sets the current session's name (also `claude -n <name>` at launch, or `Ctrl+R` in the resume picker), and that name is what the resume picker shows and what `claude --resume <name>` resolves — so a good name now is how you find this session weeks from now.

This skill **suggests, it does not apply**: a skill cannot invoke the built-in `/rename` slash command — only you can type it. So it prints a ranked list of candidates, each with a ready-to-paste `/rename <name>` line, and you run the one you like.

It is a pure in-context utility. It makes **no** tool calls, reads **no** board, transcript file, or network, and writes **nothing** — it works only from the conversation already in your context and prints text. (That is why this skill declares no `allowed-tools` and carries none of the board/MCP preconditions the workflow skills do.)

## Usage

- `/name-session` — suggest names for the current session from the conversation so far.
- `/name-session <hint>` — bias the suggestions toward a stated angle, e.g. `/name-session focus on the redis removal`.

## Process

### 1. Read what the session was actually about

Look back over the conversation **in your context** — the real tasks, topics, decisions, and outcomes of this session — and base the names on that substantive work. Explicitly **ignore as naming material**:

- ambient instructions (system / project / skill instructions, `CLAUDE.md`, this skill's own text),
- tool-call plumbing and raw tool output,
- the `/name-session` invocation itself (and its hint).

A supplied hint is a **steer** for emphasis, not session content.

### 2. Decide whether there is enough to name

- **Substantive session** (a task was worked on, a topic explored, a decision made) → go to step 3 and produce the full set.
- **Thin session** — only session setup, greetings, trivial or aborted exchanges, or you are at the very start with nothing done yet → **say so plainly** and offer just **1–3 more-general** candidates rather than inventing specifics you cannot support. Do not pad to the full count.

### 3. Generate the candidates

For a substantive session, produce **4–5** candidates, best (most representative) first.

- Make them **meaningfully different** — vary the angle: the primary task, the component/area touched, the outcome. Not five rewordings of one phrase.
- If the session had **more than one dominant topic**, it is fine for different candidates to name different topics; rank them by how central each topic was to the session. A single candidate need not cover every topic.
- **Never pad** with filler just to reach five — fewer strong names beat five weak ones.

If a **hint** was given, skew the set toward it while staying grounded in what actually happened. If the hint is **not supported by** the session (or contradicts it), say so and de-weight or drop it — never fabricate work to satisfy a hint.

### 4. Format every candidate as a short kebab name

Each name MUST:

- match `^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase letters and digits only, words joined by single hyphens, no leading / trailing / doubled hyphens, no spaces, no uppercase, no other punctuation (so the `/rename` line needs no quoting). Digits are allowed, including a leading digit.
- be **≤ 50 characters** and **2–6 words** (hyphen-separated segments) — a single word is too few; the regex alone would accept one, but a name needs 2–6 segments. Shorter is better when still specific.
- be **topic-only** — no repo prefix, no date or timestamp.
- name the session's **actual subject** with concrete nouns/verbs, recognizable weeks later in the picker. Avoid filler words like `session`, `work`, `updates`, `misc`, `stuff`.

Good: `redis-removal`, `posts-search-attribution`, `capture-spec-land-skills`.
Avoid: `session-work` / `updates` (too generic); `Redis Cleanup` (spaces and capitals); a nine-word sprawl (too long).

### 5. Print the ranked list and stop

Print the candidates as a **ranked list directly** — no menu, no follow-up question. For each, show the name, a one-line gloss of what it captures, and a ready-to-paste `/rename` line. Close with a one-line note on how to apply. Then stop.

Shape (substantive session):

```
Names for this session, best first — run the `/rename` line for the one you want.
(I can't rename the session myself; the line does nothing until you type it.)

1. `redis-removal` — removed Memorystore/Redis from the resource orchestrator
   /rename redis-removal
2. `quota-tracking-cloud-sql` — moved quota + invalid-resource caching to Cloud SQL
   /rename quota-tracking-cloud-sql
3. `orchestrator-l1-cache-drop` — simplified the orchestrator, dropped the L1 cache + locking
   /rename orchestrator-l1-cache-drop
4. `memorystore-terraform-teardown` — deleted the Memorystore Terraform + billing budget
   /rename memorystore-terraform-teardown
5. `redis-to-cloud-sql-migration` — overall: Redis → Cloud SQL migration
   /rename redis-to-cloud-sql-migration
```

Shape (thin session):

```
This session doesn't have much in it yet, so these are necessarily general:

1. `early-exploration` — opened the repo and looked around, no task started yet
   /rename early-exploration

Run /name-session again once there's real work to name.
```

## What this skill is NOT

- **Not an applier.** It cannot run `/rename` (a skill can't invoke a built-in slash command); it hands you the line to run.
- **Not a transcript reader.** It uses the in-context conversation, not the session's `.jsonl` on disk.
- **Not board-aware.** No backlog, no milestone, no spec — it never touches the board or any file.

## Rules

- **In-context only.** Make no tool calls, no board/MCP reads, no network calls, and no file writes. The conversation in context is the sole source.
- **Suggest, don't apply.** Always present ready-to-paste `/rename <name>` lines and state that the user runs them.
- **Honor the format.** Every printed name is valid kebab (`^[a-z0-9]+(-[a-z0-9]+)*$`), ≤ 50 chars, 2–6 words, topic-only.
- **Don't invent.** On a thin session or an unsupported hint, say so and stay general — never fabricate work that didn't happen.
