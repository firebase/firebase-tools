---
name: recall
description: Search past Gemini meeting transcripts AND Gmail email threads for context on a topic. Searches both Google Drive ("Notes by Gemini" docs) and Gmail in parallel by default, returns a recency-weighted cross-source synthesis with verbatim quotes, speakers, and timestamps; fetched docs/threads are cached under ~/.claude/cache/ for faster re-runs. Use when the user asks "what did we discuss about X", "find the meeting where Y", "what did we email about Z", "pull context on A from past meetings or emails", "what was decided about B" or "recall the conversation about C" (meaning past meetings/emails — not the current chat or repo files), "what's our history with D", or invokes /recall. Delegates Drive search, Gmail search, and document parsing to a subagent so the main session stays clean — only the structured digest comes back.
allowed-tools:
  - Bash(date:*)
argument-hint: "[<topic>] [--since <date>] [--until <date>] [--meeting <name>] [--source meetings|email|meetings,email] [--order recency|relevance]"
---

# Recall — Search Past Meetings & Emails

Pull context from past Gemini meeting transcripts AND Gmail email threads when working on a topic. Searches both sources in parallel by default, parses the relevant content (Notes/Transcript tabs in Drive; thread bodies in Gmail), and returns a recency-weighted cross-source synthesis with citations.

The heavy work — Drive search, Gmail search, base64-decoded markdown extraction, Gmail thread parsing, sibling-doc dedup, quality detection on garbled transcripts, recency-weighted synthesis across sources — runs entirely inside a delegated subagent. Only the structured result comes back to the main session. This keeps the main context clean even when the topic spans 5+ meetings and 3+ email threads totaling 200KB+ of raw content.

## Usage

- `/recall <topic>` — Search both sources, all time, recency-weighted synthesis
- `/recall what did we decide about UniSound` — Natural-language query (cross-source)
- `/recall Merlin --since 2026-01-01` — Restrict by date (both sources)
- `/recall license enforcement --meeting "Group Updates"` — Meeting-name filter (Drive only — Gmail has no direct equivalent)
- `/recall "co-founder"` — Phrase query (use double quotes inside the topic for exact match including punctuation)
- `/recall scrapers --order relevance` — Override default recency ordering
- `/recall Merlin --source meetings` — Drive-only (skip Gmail)
- `/recall TikTok --source email` — Gmail-only (skip Drive)
- `/recall UniSound --source meetings,email` — Explicit dual-source (equivalent to omitting the flag)
- `/recall what did we email about Merlin` — Email-shaped query auto-trigger

Auto-trigger: phrases like "what did we discuss about X", "find the meeting where Y", "what's our history with Z", "recall the conversation about A", "what did we email about B", "pull context on C from past meetings or emails".

## When invoked

### 1. Parse the request

Extract from `$ARGUMENTS`:

- **topic** — required; everything not matched by a flag
- **`--since <date>`** — optional RFC3339 or relative ("3 months ago"). Convert to RFC3339 with `date -v-3m -u +%FT%TZ` on macOS, `date -d '3 months ago' -u +%FT%TZ` on Linux
- **`--until <date>`** — optional, same handling
- **`--meeting <name>`** — optional; restricts Drive titles to those containing this substring (e.g., "Group Updates", "Torben / Julius"). Has no Gmail equivalent and is silently ignored on the Gmail side
- **`--source meetings|email|meetings,email`** — optional; default `meetings,email` (both sources in parallel). `meetings` skips Gmail entirely; `email` skips Drive entirely; `meetings,email` is equivalent to omitting the flag. Any other value is rejected with a clear error message listing valid values.
- **`--order recency|relevance`** — optional; default `recency` (most recent first), `relevance` falls back to each source's default ordering

If no topic given, ask the user via `AskUserQuestion` what topic they want to search. Don't guess from session context — the user's intent here is explicit.

### 2. Spawn the subagent

Use `Task` with `subagent_type: general-purpose`. Pass it the prompt below as a single message. The subagent is responsible for auth probing, Drive search, Gmail search, parsing, dedup, quality detection, and synthesis.

Subagent prompt template (substitute the parsed values, keep the rest verbatim):

````
You are a research subagent for retrieving cross-source context (Google Drive meeting transcripts + Gmail email threads). The main session needs only your final structured output — be exhaustive in research, terse in reporting.

## Task

Find every relevant source for the topic below. Build a recency-weighted synthesis with verbatim quotes, attributions, and timestamps. Return the structured response in the format defined at the bottom — nothing else.

Topic: {{topic}}
Date range: {{since}} to {{until}} (omit either bound for open-ended)
Meeting filter: {{meeting_name}} (or "any" for all meetings)
Source: {{source}} — one of `meetings`, `email`, `meetings,email`. Default = `meetings,email` (both sources in parallel)
Order: {{order}}
User's query language: {{query_language — infer from the topic phrasing; default English}}

## Tooling setup (REQUIRED FIRST STEP)

The Drive and Gmail MCP tools are deferred — they are NOT in your initial tool list. Before you can use them, call `ToolSearch` with the appropriate `select:` query based on which sources are enabled per `{{source}}`:

- If `{{source}}` includes `meetings`: include `mcp__claude_ai_Google_Drive__search_files,mcp__claude_ai_Google_Drive__download_file_content`
- If `{{source}}` includes `email`: include `mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_thread`

Example for the default dual-source case:

  query: "select:mcp__claude_ai_Google_Drive__search_files,mcp__claude_ai_Google_Drive__download_file_content,mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_thread"

## Auth probe (per enabled source)

Before searching, probe each ENABLED connector with a `pageSize: 1` no-op search to surface auth errors early:

- Drive (if enabled): `search_files` with `query: "title contains 'XXNONEXISTENTPROBEXX'"`, `pageSize: 1`, `excludeContentSnippets: true`
- Gmail (if enabled): `search_threads` with `query: "subject:XXNONEXISTENTPROBEXX"`, `pageSize: 1`

These topics are crafted not to match real content; if either tool returns successfully (even with empty results), the connector is reachable.

Two failure modes that are NOT connector auth errors — never answer them with the Connect-in-Settings remediation:

- **ToolSearch returns no match** for a requested tool name → the Google connector is not wired into this surface at all. Report `<Source> connector unavailable on this surface` and apply the same degradation rules as an auth failure for that source (skip its probe).
- **Harness permission denial** (the probe is rejected with a Claude Code permission-denied message naming the tool, before any Google error) → known bug claude-code#18950: `permissions.allow` does not propagate to subagents. The connector may be fine. Report `⚠️ <tool> blocked by local permissions — verify the yourvid-tools plugin and its auto-approve-recall-readonly hook are enabled, and check deny rules` instead of claiming the source is disconnected.

Auth-degradation rules:

- If only Drive returns an authentication error AND Gmail is enabled: prefix the FINAL output with `⚠️ Drive not connected — email results only. Connect Google Drive in Claude.ai → Settings → Connectors for full coverage.` and run Gmail-only.
- If only Gmail returns an authentication error AND Drive is enabled: prefix the FINAL output with `⚠️ Gmail not connected — meeting results only. Connect Gmail in Claude.ai → Settings → Connectors for full coverage.` and run Drive-only.
- If BOTH connectors are enabled and BOTH return auth errors: return the combined remediation message below and exit without further tool calls.
- If `{{source}}` restricts to a single source and that source's connector fails auth: probe only that source; on failure, return the matching single-source remediation message below and exit. (Do NOT probe the other source — the user explicitly excluded it.)

Drive-only-restricted failure message (used when `--source meetings` was specified and Drive auth fails):

```
## Drive not connected

Connect Google Drive in Claude.ai → Settings → Connectors, then retry. (Gmail was not searched because `--source meetings` was specified — drop the flag to search both sources.)
```

Gmail-only-restricted failure message (used when `--source email` was specified and Gmail auth fails):

```
## Gmail not connected

Connect Gmail in Claude.ai → Settings → Connectors, then retry. (Drive was not searched because `--source email` was specified — drop the flag to search both sources.)
```

Combined-fail message (used when both connectors are enabled and both fail):

```
## Drive and Gmail not connected

Connect both in Claude.ai → Settings → Connectors, then retry:
- Drive: required for meeting-transcript search
- Gmail: required for email-thread search
```

## Non-auth tool error handling

For tool errors that are NOT authentication failures (Drive 5xx, Gmail rate limit, malformed responses, `get_thread` per-thread failures, network timeouts):

- **Search-call failures** (`search_files` or `search_threads`): retry once after a 5-second pause. If the second attempt also fails, treat the source as 0-results for this query (the no-match output's "Tried" line lists the failure cause) and continue with the other source. Never block the whole skill on a single source's transient failure.
- **`download_file_content` (Drive) failures** for a specific doc: skip that document for full-content extraction; the meeting block uses snippet-only depth with a `Depth: snippet (download failed)` note. Do not retry per-doc — the cost would compound.
- **`get_thread` (Gmail) failures** for a specific thread: skip that thread for FULL_CONTENT; stay at Tier 1 (snippets-only) for that thread with a `Depth: snippets (FULL_CONTENT failed)` note.
- **Malformed JSON in tool responses**: never write the malformed payload to cache; log to subagent stderr; treat as a fetch failure per the rules above.
- **Cache read failures** (file corruption, JSON parse error on an existing cache file): treat as cache miss; re-fetch. If the re-fetch also produces malformed data, fall back to snippet-only and surface in stderr.
- **All-sources-failed** (no auth issue but every enabled source produced 0 usable results due to errors): render the no-match output with each source's specific failure cause in the "Tried" line.

All non-auth errors are logged to subagent stderr but never block the overall response — the user gets partial-coverage results plus a clear indicator of which sources degraded.

## Search

Run the enabled-source searches IN PARALLEL (a single tool-call batch with both `search_files` and `search_threads` calls when both sources are enabled). Wait for both before deciding next steps.

### Drive query construction

#### Sanitize user inputs (REQUIRED for Drive)

Before substituting `<topic>` or `<meeting_name>` into the Drive query string, escape single quotes by doubling them and escape backslashes. Otherwise inputs like `O'Brien`, `what's our history`, or terms with backslashes produce malformed queries that Drive rejects.

  topic_safe       = topic.replace("\\", "\\\\").replace("'", "''")
  meeting_safe     = meeting_name.replace("\\", "\\\\").replace("'", "''")

Use the `_safe` versions in every Drive query string below.

#### Build the Drive query

Always include:

  fullText contains '<topic_safe>'
  AND title contains 'Notes by Gemini'
  AND mimeType = 'application/vnd.google-apps.document'

Add filters when present:
- Date: `AND modifiedTime > 'YYYY-MM-DDT00:00:00Z'` and/or `AND modifiedTime < ...`
- Meeting: `AND title contains '<meeting_safe>'`

Note: the MCP `search_files` tool's schema specifies `title` as the query term (despite Drive API v3 docs using `name`). Use `title contains`, not `name contains`.

Order:
- recency → `orderBy: 'modifiedTime desc'`
- relevance → omit `orderBy`

Pass `excludeContentSnippets: false` so each result includes a ~5KB content snippet.

Use `pageSize: 20` on the first call. If `nextPageToken` is set, treat the count as "20+ matches": if the user explicitly asked for "all" or "everything", paginate up to 3 more pages (cap at 80 results); otherwise return the "Too many matches" response (defined in Output format) listing the first 20 titles.

Empty result format: the response is `{}` (no `files` key). Treat missing `files` as zero results.

### Gmail query construction

Build the Gmail query. ALWAYS auto-prepend the noise-exclusion to every Gmail query — these auto-emails duplicate Drive's "Notes by Gemini" docs and would pollute results:

  <topic_protected> -from:gemini-notes@google.com

**Defensive topic protection (REQUIRED for Gmail):** Gmail interprets unquoted `<topic>` content using its query syntax. A topic that starts with `-` is read as exclusion; a topic starting with a known Gmail operator prefix (`from:`, `to:`, `cc:`, `bcc:`, `subject:`, `has:`, `is:`, `label:`, `category:`, `before:`, `after:`, `newer_than:`, `older_than:`, `larger:`, `smaller:`, `list:`, `deliveredto:`, `rfc822msgid:`, `filename:`) is reinterpreted as that operator. To prevent unintended hijack of the query semantics:

1. If `<topic>` starts with `-` OR matches `^<known-operator>:` (case-insensitive on the operator name), wrap it in double quotes (`"<topic>"`) and escape any internal `"` to `\"`. The quote forces literal-substring match and neutralizes operator interpretation.
2. Otherwise, leave `<topic>` as-is (most natural-language topics like `Merlin` or `Buddha Music` don't trigger this rule and work fine without quoting).

Apostrophes and other punctuation in `<topic>` do NOT need the same single-quote escaping as Drive — Gmail's parser handles them natively. Phrase-quoted topics (those wrapped in `"…"` by the user) are passed through verbatim as exact-phrase queries.

Add filters when present:
- Date: append `after:YYYY/MM/DD` and/or `before:YYYY/MM/DD` (Gmail format uses slashes; convert from RFC3339 by stripping the time portion). Example: `--since 2026-01-01` → `after:2026/01/01`.
- `--meeting`: ignored for Gmail (no direct equivalent — meeting names map to Drive titles, not email subjects). If present, log to subagent stderr but do not modify the Gmail query.

Order:
- recency: rely on Gmail's default (descending date) — Gmail's `search_threads` doesn't expose an explicit order parameter
- relevance: same — Gmail's default ordering blends relevance and recency

Pagination: `pageSize: 20`. If the response includes `nextPageToken`, treat the count as "20+ matches": if the user explicitly asked for "all" or "everything", paginate up to 3 more pages (cap at 80 results); otherwise return the "Too many email matches" response (Output format) listing the first 20 subject + date pairs.

Empty result format: the response is `{}` (no `threads` key). Treat missing `threads` as zero results.

## Query variant fallback (per source, only when 0 results)

When a source returns 0 results on the initial query, try ONE retry with OR-combined variants (independent per source):

- For multi-word topics: split into individual words joined with `or` (Drive) / `OR` (Gmail; uppercase required)
- For English technical terms common in German meetings, add German equivalent (e.g., "research funding" → also try "Forschungszulage"; "scraper" → "Scraper", "Scrapen")
- For hyphenated terms: try the unhyphenated variant

Drive variant example:

  (fullText contains 'research funding' or fullText contains 'Forschungszulage' or fullText contains 'FORAG')
  AND title contains 'Notes by Gemini'
  AND mimeType = 'application/vnd.google-apps.document'

Gmail variant example:

  (research funding OR Forschungszulage OR FORAG) -from:gemini-notes@google.com

Retries are independent per source — each can succeed or fail independently. If all enabled sources still return 0 after their respective retries (e.g., both Drive and Gmail in dual-source mode, or just the one source under `--source meetings`/`--source email`), render the no-match output (Output format).

The "Tried" line in the no-match output lists initial and variant queries (when variants were attempted) per enabled source, with non-auth errors noted inline.

## Triage and depth — Drive

For each Drive result, examine its `contentSnippet` (first ~5KB of doc body — Gemini's Summary section is usually fully included). Use the snippet to triage, but the output format below requires verbatim quotes with speaker + timestamp, which only the Transcript tab provides — so default to downloading.

- **Always download** when the per-meeting `Quotes:` section will be populated (the typical case).
- **Snippet-only is acceptable** only when (a) the user's query is yes/no or one-line factual that the Summary clearly resolves AND (b) the user did not ask for evidence or quotes. In this case omit the `Quotes:` section for that meeting (or render it as `—`) and cite the snippet in the digest.

Cap full Drive downloads at 5 docs per query. If more are needed, prioritize by recency (newest first) when order=recency, or by Drive's relevance order otherwise.

### Drive download and parse

For each doc that needs full content:

1. Build a path-safe cache key. Drive's `modifiedTime` is RFC3339 with colons and dots; strip them:

   ```bash
   MTIME_SAFE=$(printf '%s' "$modifiedTime" | tr ':.' '-')
   CACHE_FILE="$HOME/.claude/cache/gemini-meetings/${fileId}_${MTIME_SAFE}.md"
   ```

2. Cache check: if `"$CACHE_FILE"` exists AND is non-empty (`[ -s "$CACHE_FILE" ]`), read it directly and skip steps 3–4.

3. Otherwise call `mcp__claude_ai_Google_Drive__download_file_content` with `exportMimeType: "text/markdown"`. Two paths:
   - **Large docs** (most cases): the harness persists the JSON to a file and reports the path in the error message. Use that path.
   - **Small docs**: JSON returned inline. Write it to a temp file before piping to `jq`.

4. Decode atomically — write to a temp file, validate non-empty/non-null, then `mv` into place:

   ```bash
   set -o pipefail
   mkdir -p "$(dirname "$CACHE_FILE")"
   TMP=$(mktemp)
   if jq -er '.content[0].embeddedResource.contents.blob' "$TMP_JSON" \
        | base64 -d > "$TMP" && [ -s "$TMP" ]; then
     mv "$TMP" "$CACHE_FILE"
   else
     rm -f "$TMP"
     echo "Decode failed for $fileId — skipping cache, will retry on next invocation" >&2
   fi
   ```

5. Split tabs into per-invocation temp files via `mktemp -d`. Anchor on emoji-marked headings — words after the emoji are localized but `📝` (Notes) and `📖` (Transcript) are stable:

   ```bash
   WORK=$(mktemp -d)
   NOTES="$WORK/notes.md"
   TRANSCRIPT="$WORK/transcript.md"

   awk '/^# 📝 /{found=1} /^# 📖 /{exit} found' "$CACHE_FILE" > "$NOTES"
   awk '/^# 📖 /{found=1} found' "$CACHE_FILE" > "$TRANSCRIPT"
   ```

   Edge cases:
   - `$NOTES` empty → no Notes tab (rare; treat as transcript-only).
   - `$TRANSCRIPT` empty → no Transcript tab (rare). Treat as notes-only and skip the Quotes section for that meeting.

6. Read `$NOTES` fully (always under 15KB). Read `$TRANSCRIPT` only if Notes don't answer the question. Clean up `$WORK` after you're done with the meeting.

### Drive sibling-doc handling

The same meeting can produce TWO docs when:
1. Bilingual recording → both `Notes by Gemini (English)` and `Notes by Gemini (German)` exist as separate Drive files.
2. Transcription was restarted mid-meeting because Gemini detected the wrong language at first → an early garbled doc + a later clean doc.

Detect siblings by parsing `(meeting_name, datetime)` from the title:
  - `<Meeting Name> – YYYY/MM/DD HH:MM <TZ> – Notes by Gemini[ (Language)]`
  - Two results with the same meeting_name AND a datetime within ±60 minutes are siblings.

For each sibling pair, run a quality probe on the **Transcript file only** (`$TRANSCRIPT` from the parse step — never on Notes, which legitimately contains words like "Yeah" or "foreign"):

- Tokenize `$TRANSCRIPT` by whitespace; let `total_tokens` be the count.
- `placeholder_count` = sum of:
  - Whole-word case-sensitive `foreign`
  - Whole-line speaker turns whose entire content matches `^(Mhm|Yeah|Uh|Hmm|Mm|Oct|Eh)\.?$` after the speaker label is stripped
  - Whitespace-separated 1-2 character ASCII-letter tokens
- `density = placeholder_count / total_tokens`.
- If one sibling has `density > 0.4` AND the other has `density < 0.2` → demote the high-density one. Mention in output as `(low-quality transcript demoted: <fileId>)`. Still extract its Notes-tab content.
- Otherwise → treat both as the same meeting and merge: prefer quotes from the user's query language; deduplicate identical action items; list both fileIds in `## Sources`.

## Triage and depth — Gmail (TWO TIERS)

Gmail uses a **two-tier** depth model. There is no MINIMAL tier — `get_thread MINIMAL` returns the same shape as `search_threads` snippets and adds no body content, so it is never invoked.

### Tier 1: search_threads snippets

Each `search_threads` result thread already has per-message snippets (~150 chars each) plus headers. Use these for triage:
- Read the snippets carefully
- Decide if the thread is on-topic
- Skip clearly off-topic threads (transactional auto-mails, marketing forwards from `email@musicbizworldwide.com` etc., calendar invites with no follow-up)

### Tier 2: get_thread FULL_CONTENT (sequential, capped, size-guarded)

For each on-topic thread, **fetch FULL_CONTENT one thread at a time, evaluating topic-coverage between fetches**. Stop early when the topic is sufficiently covered.

**Pre-read size guard (REQUIRED before each fetch):** estimate the thread size from `messages.length × 4_000` bytes (≈4 KB average per message). If the estimate exceeds 100,000 OR `messages.length > 30`, **skip FULL_CONTENT for that thread**. The thread stays at Tier 1 (snippets-only) and the Depth field reads `snippets (thread too large for FULL_CONTENT)`.

**Hard cap: at most 2 FULL_CONTENT downloads per query** (lowered from the original "top 3" because grounding established the comfortable absorption budget at ≈130 KB / `2 × 67 KB`; `3 × 67 KB ≈ 200 KB` exceeds that ceiling). Sequential fetching with topic-coverage evaluation makes the third rarely productive even when below the budget.

For each Tier 2 fetch:

1. Validate `lastMessageDate` matches RFC3339: `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$`. If malformed (missing, wrong format, or contains path-unsafe chars beyond the standard `:` and `.` that get sanitized), skip caching for this thread — re-fetch on each invocation. Log to subagent stderr but do not fail the skill.

2. Build the cache key (only if validation in step 1 passed):

   ```bash
   LASTMSG_DATE_SAFE=$(printf '%s' "$lastMessageDate" | tr ':.' '-')
   CACHE_FILE="$HOME/.claude/cache/gmail-threads/${threadId}_${LASTMSG_DATE_SAFE}.json"
   ```

   `lastMessageDate` is the date of the most recent message in the thread (RFC3339 from search results).

3. Cache check: if `"$CACHE_FILE"` exists AND is non-empty, read it and skip the fetch.

4. Call `mcp__claude_ai_Gmail__get_thread` with `messageFormat: "FULL_CONTENT"`. Two paths (mirroring the Drive flow):
   - **Large threads** (typical for ≥5-message threads): the harness persists the JSON to a file because it exceeds the inline limit and reports the persisted path in the error message. Use that path as `$TMP_JSON`.
   - **Small threads**: JSON returned inline. Write it to a temp file before piping to `jq`: `printf '%s' "$inline_json" > "$TMP_JSON"`. Without this step the next jq pipeline runs against an undefined variable.

5. Atomic write to cache, with **shape validation** to ensure we only cache valid FULL_CONTENT responses (not `{}`, `null`, or partial/truncated payloads):

   ```bash
   set -o pipefail
   mkdir -p "$(dirname "$CACHE_FILE")"
   TMP=$(mktemp)
   # Shape check: messages must be a non-empty array. Reject {}, null, truncated.
   if jq -e '(.messages | type == "array") and (.messages | length > 0)' "$TMP_JSON" > /dev/null \
        && jq '.' "$TMP_JSON" > "$TMP" \
        && [ -s "$TMP" ]; then
     mv "$TMP" "$CACHE_FILE"
   else
     rm -f "$TMP"
     echo "Cache write failed for thread $threadId (invalid or empty FULL_CONTENT shape) — proceeding without cache" >&2
   fi
   ```

6. Threads skipped by the pre-read estimate (FR4-AC5) are NOT cached. Re-running the same query stays at snippets-only — no wasted fetch.

7. Quoted-reply trimming: when extracting excerpts from `messages[].plaintextBody`, exclude:
   - Lines starting with `>` (reply quotes)
   - Everything after a separator line. English: `On <day>, <date> at <time>, <name> wrote:` or `---------- Forwarded message ---------`. German: `Am <date> um <time> schrieb <name>:` or `---------- Weitergeleitete Nachricht ---------`. French: `Le <date> à <time>, <name> a écrit :` or `---------- Message transféré ---------`.
   - Signature blocks below `--` (or `-- ` with trailing space) separators or after recognizable sig text (`Software & Cloud Architect`, `Managing Director`, `Mit freundlichen Grüßen`, etc.).

   The LLM applies this trimming heuristically — perfect filtering isn't required; the goal is verbatim quotes that read as standalone content.

8. HTML entities: decode common named entities before rendering — `&#39;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&nbsp;`, `&mdash;`, `&ndash;`, `&lsquo;`, `&rsquo;`, `&ldquo;`, `&rdquo;`, `&hellip;`, `&laquo;`, `&raquo;`, `&copy;`, `&reg;`, `&trade;` — and numeric entities (`&#NNN;` decimal and `&#xHHHH;` hex). Untreated entities will leak into quotes; the LLM should recognize and decode any not in this enumeration on a best-effort basis.

## Recency-weighted synthesis (cross-source)

When the total result count across both sources is ≥2, write a synthesis that pulls from both:

- **Single timeline**: meeting `modifiedTime` and email `lastMessageDate` are both RFC3339 — order all results on one timeline.
- **Most-recent statement defines current state.** Older statements that contradict are flagged as "earlier `<date>` the position was X; superseded as of `<date>`".
- **Statement attribution** uses the SPECIFIC source of the statement: for a meeting, the meeting's date; for an email-thread quote, the SPECIFIC message's date (not the thread's `lastMessageDate`, which is reserved for thread-level ordering and cache invalidation).
- **Synthesis language**: user's query language. **Quotes**: source language verbatim.
- When only one source has results, no cross-source language; render as single-source synthesis (existing behavior preserved).

## Output format (return EXACTLY this structure, in the user's query language)

If both sources return 0 (after variant fallback per FR3):

```
## No matches for "<topic>"

Tried (Drive): <drive query 1>, <drive query 2 if variant attempted>
Tried (Gmail): <gmail query 1>, <gmail query 2 if variant attempted>

Suggestions to narrow or broaden:
- <suggested rephrasing 1>
- <suggested rephrasing 2>
- <suggested filter (e.g., remove --since)>
```

If Drive >20 matches AND user did NOT ask for "all":

```
## Too many meeting matches (<N>+) — narrow the query

Top titles by date:
- <date> — <meeting name> [link]
- ...
- (up to 20)

Suggested narrowing: --since <date>, or add a more specific term, or --meeting <name>.
```

If Gmail >20 matches AND user did NOT ask for "all":

```
## Too many email matches (<N>+) — narrow the query

Top threads by date:
- <date> — <subject> (<participants summary>) [link]
- ...
- (up to 20)

Suggested narrowing: --since <date>, or add a more specific term, or --source meetings to skip Gmail.
```

Otherwise the standard structure (omit any sub-source blocks for which the user used `--source` to disable):

```
[⚠️ <Source> not connected — <other> results only. Connect ... line at top, when applicable.]

## Synthesis

<2-4 sentences cross-source synthesis with explicit recency notes.
Only include if ≥2 total results across both sources combined.
Single-result-total skips this section.>

## Meetings

### <Meeting title> — <YYYY-MM-DD>
- Link: <viewUrl from Drive search result>
- Tabs read: notes | notes+transcript
- Digest: <2-3 sentences on how this topic was discussed>
- Quotes:
  - "<verbatim quote in source language>" — <Speaker Name>, <HH:MM:SS>
  - "<verbatim quote>" — <Speaker Name>, <HH:MM:SS>
- Action items mentioning this topic:
  - [<Person>] <Action title>: <description>
  - (or "None")

(repeat per meeting, ordered by --order)

(or, when Drive returned 0 matches in dual-source mode:)
_(no meeting matches for this query)_

## Email threads

### <Subject> — <YYYY-MM-DD to YYYY-MM-DD>
- Participants: <smart summary, e.g., "internal: Torben Wetter, Julius Grimm; external: Ashley Morton, Andres Ginebra (Unisound)">
- Link: https://mail.google.com/mail/u/0/#all/<threadId>
- Depth: snippets | full
- Digest: <2-3 sentences on how this topic was discussed in this thread>
- Excerpts:
  - "<verbatim quote in source language>" — <Sender>, <YYYY-MM-DD>          ← when Depth: full
  - "[snippet] <quote from search snippet>" — <Sender>, <YYYY-MM-DD>        ← when Depth: snippets
- Decisions / action items:
  - <opportunistically extracted from email body language — commitments like "I'll send by", asks like "can you confirm", scheduling like "let's meet">
  - (or "None")

(repeat per thread, ordered by --order)

(or, when Gmail returned 0 matches in dual-source mode:)
_(no email matches for this query)_

## Sources

- meeting:<fileId>: <title> (<modifiedTime>)
- email:<threadId>: <subject> (<lastMessageDate>)

(when applicable: "(low-quality sibling demoted: <fileId>)")
```

### Email thread rendering rules

- **Subject**: use the most-recent message's subject (typically prefixed with `Re:` for replies — keep as-is).
- **Date range**: `<earliest message date> to <latest message date>` from the thread's messages. If single-message thread, render as a single date.
- **Participants summary**: smart format with internal/external grouping when discernible. Internal = `*@yourv.id` and `*@ext.yourv.id`. External = everyone else, optionally suffixed with `(Org)` derived from the email domain (e.g., `andres@unisound.io` → `Andres Ginebra (Unisound)`). When no display name is available, use the email local-part.
- **Link**: always `https://mail.google.com/mail/u/0/#all/<threadId>`.
- **Depth**: `snippets` (thread skipped by pre-read guard, or only snippets-relevant) or `full` (FULL_CONTENT was fetched and parsed). No `minimal` value.
- **Excerpts**: verbatim from `plaintextBody` (full depth) or snippet-derived with `[snippet]` prefix (snippets depth). Each excerpt attributed `— <Sender>, <YYYY-MM-DD>` using the SPECIFIC message's date — never the thread's `lastMessageDate`.
- **Decisions/action items**: extracted opportunistically. Use email-body language signals: commitments ("I'll send", "I'll prepare"), asks ("can you confirm", "let me know"), scheduling ("let's meet", "send an invite"), explicit decisions ("we'll go with", "approved"). False-positive risk acceptable.

## Token budget

Cap your final response at ~6000 tokens (same target as before, despite cross-source). Cross-source content compresses harder, not bigger. When budget pressure forces trimming:
- Preserve verbatim quotes over digest length — losing quotes loses evidence; losing digest verbosity is recoverable
- Preserve the most recent quotes per meeting/thread (3 most relevant per item)
- Truncate the synthesis to 2 sentences if needed before truncating quotes
````

### 3. Present the result

Return the subagent's output verbatim. Do NOT re-summarize — the subagent has already done recency-weighted synthesis. Re-summarizing destroys the carefully-preserved verbatim quotes and citations.

If the subagent returns a "Too many matches" or "Too many email matches" block, optionally offer to narrow with the user via `AskUserQuestion`.

If the subagent returns the combined "Drive and Gmail not connected" message, relay that and stop.

## Critical rules

- **Never bypass the subagent.** Even for a "quick check", spawn the subagent. The pattern's value is keeping the main session lean — making one direct Drive or Gmail call now means two more next turn, and the context grows.
- **Never re-summarize the subagent's output.** It has already condensed thousands of words to a few hundred. Re-summarizing loses the timestamps and verbatim quotes that make this skill useful.
- **Respect the language rule.** Synthesis in the user's query language; quotes in the source language. Never translate quotes — that destroys their evidentiary value when the user wants to know exactly what was said.
- **Don't auto-paginate beyond 80 results per source.** If the user wants more, they should narrow the query.
- **Don't save anything to the user's memory or repo.** This skill is read-only on both Drive and Gmail. Outputs go to the conversation only.
- **Drive cache invalidation.** Cache key is `<fileId>_<MTIME_SAFE>.md` where `MTIME_SAFE = modifiedTime | tr ':.' '-'`. Never cache without a sanitized `modifiedTime` — Gemini docs CAN be edited after generation, and stale cache silently returns wrong content.
- **Gmail cache invalidation.** Cache key is `<threadId>_<lastMsgDateSafe>.json` where `lastMsgDateSafe = lastMessageDate | tr ':.' '-'`. Cache holds **FULL_CONTENT only** (the only depth ever cached — Tier 1 snippets are not separately cached). When a thread gains new replies, `lastMessageDate` changes → new key → cache miss → re-fetch. Always write atomically (temp file → mv) so a failed JSON parse never leaves a half-written file.
- **Gmail is read-only from this skill.** Never call `create_draft`, `create_label`, `label_thread`, `unlabel_thread`, `label_message`, `unlabel_message`, or any other Gmail mutation tool — even if the search would benefit from labeling. The skill's contract is read-only context retrieval.
- **Always exclude `from:gemini-notes@google.com`** from every Gmail query. These auto-emails duplicate the Drive Notes-by-Gemini docs and would generate redundant results.
- **Gmail cache contains PII / sensitive business data.** The `~/.claude/cache/gmail-threads/` directory holds verbatim email bodies (sender/recipient addresses, subject lines, message content). Never log file paths or content to the parent context. Cache files are NOT version-controlled — the directory lives in the user's home, outside any repo. The skill never auto-deletes cache files; for periodic cleanup, the user can run `find ~/.claude/cache/gmail-threads -mtime +30 -delete` to purge entries older than 30 days. Confirm `~/.claude/cache/` is not included in any backup/sync that would expose the data outside the user's control.

## Why this design

- **Subagent isolation**: meeting transcripts are 30–60KB each; email threads can hit 67KB at FULL_CONTENT. A 5-meeting + 2-thread cross-source query is 200KB+ raw. Reading them in the parent would consume the user's working context for what's effectively a research lookup. The subagent reads, distills, and discards — only the digest reaches the parent.
- **Tab markers via emoji** (Drive): Gemini localizes the tab names ("Notes" / "Hinweise" / "Notizen" / "Transcript" / "Transkript") but the `📝` and `📖` emoji are stable. Splitting on the emoji is the only language-agnostic approach.
- **Two-tier Gmail (no MINIMAL)**: `get_thread MINIMAL` returns the same shape as `search_threads` snippets — same per-message snippets, same headers, no body content. Calling it adds latency and zero information. Two real tiers: snippets vs FULL_CONTENT.
- **FULL_CONTENT cap of 2 with sequential fetch**: investigation showed a 17-message thread is 67KB; the comfortable subagent absorption ceiling is ≈130 KB (`2 × 67 KB`), and `3 × 67 KB ≈ 200 KB` exceeds it. Sequential fetch with topic-coverage evaluation between each lets the subagent stop early when the topic is sufficiently covered, making even the second rarely required and the third never productive.
- **Pre-read size guard** (`messages.length × 4_000` or `> 30 messages`): protects against large support threads (50+ messages) that would blow the budget if fetched.
- **Recency weighting matters**: a search by "Merlin" returns 6+ meetings spanning a year and an email thread with ByteDance. The most recent activity supersedes earlier discussion. Without explicit recency weighting, dense old matches dominate and the user gets stale context.
- **Sibling-doc quality detection**: when Gemini misdetects language and restarts transcription, you get an early garbled doc + a later clean doc with the same meeting time. Naively merging both pollutes the output with `foreign` / `Mhm` / `Yeah`. Density check on placeholder tokens reliably identifies the garbled one.
- **Cross-source value confirmed** (UniSound case): meeting transcript framed Julius's skepticism + Torben's mention of an upcoming meeting; the actual decision evolution (cold pitch → call setup → post-call technical Q&A → Torben's German verdict to Julius → Julius's task assignment) lived entirely in a 17-message email thread. A recall query that pulled only one source missed half the story. Hence dual-source by default.
- **Auto-exclude `gemini-notes@google.com`**: empirical investigation showed these auto-emails duplicated ~50% of Gmail topic-search results (since they're sent for every meeting). Auto-excluding is a no-brainer cleanup; nothing of value is lost (the actual Gemini doc is searched via Drive instead).
