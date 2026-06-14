---
name: message
description: Draft messages to colleagues or external contacts with auto-detected context from the current conversation, recipient-aware tone and language. Drafts only — never sends. Use when the user asks to "draft a message", "write an email", "send a message to", "reply to [name]", "respond to [name]'s email or chat", or "tell [name] about".
argument-hint: "[<recipient> [about <topic>]] [--channel email|chat|whatsapp]"
---

# Message Drafting Skill

Draft messages to team members or external contacts with automatic context detection from the current conversation, recipient-specific tone and language. The skill presents a single finished draft; it does not run an approval loop.

## Usage

- `/message` - Interactive: asks who and what
- `/message deby about the registration results` - Recipient + topic
- `/message julius status update on workflow 4` - Recipient + topic
- `/message support@example.com about the API issue` - External contact
- `/message lorenz about the release --channel chat` - Force a specific channel

The optional `--channel email|chat|whatsapp` flag overrides channel inference (see step 2). When omitted, the channel is inferred without prompting.

## Team Directory

| Alias            | Full Name        | Pronouns | Role                                 | Language | Email                     |
| ---------------- | ---------------- | -------- | ------------------------------------ | -------- | ------------------------- |
| julius           | Julius Grimm     | he/him   | Managing Director                    | German   | julius.grimm@yourv.id     |
| maxi, maximilian | Maximilian Spall | he/him   | Head of Finance                      | German   | maximilian.spall@yourv.id |
| deby, deborah    | Deborah Yu       | she/her  | Team Lead Operations                 | English  | deborah.yu@yourv.id       |
| maru             | Maru Montemayor  | he/him   | Senior Content Operations Specialist | English  | maru.montemayor@yourv.id  |
| lorenz           | Lorenz Grimm     | he/him   | Platform & Rights Manager            | German   | lorenz.grimm@yourv.id     |

Any name not matching the directory is treated as an external contact.

> Pronouns must stay consistent with `~/Repositories/YourVid/CLAUDE.md` → Team Pronouns (the canonical, every-session copy); update both together.

## Process

### 1. Parse Arguments

**If arguments provided:**

- Pull off any `--channel email|chat|whatsapp` flag first and hand it to step 2; don't treat it as part of the topic
- Extract recipient: first word or name (match against team directory aliases, case-insensitive)
- Extract topic: everything after recipient name, stripping leading "about" / "regarding" / "re"
- If recipient not recognized, treat as external contact and ask for details

**If no arguments:**

Use `AskUserQuestion` to ask:

- "Who is this message for?" (options: Deby, Julius, Lorenz, Maxi, Other)
- "What's the message about?" (free text)

### 2. Infer Channel

Determine the communication channel **without prompting**. Walk this ordered decision table top to bottom and stop at the first row that matches:

| Order | Condition                                                                 | Channel chosen   |
| ----- | ------------------------------------------------------------------------- | ---------------- |
| 1     | A `--channel` flag is given (`email` \| `chat` \| `whatsapp`)             | Use the flag value |
| 2     | Recipient is an external email address                                    | Email            |
| 3     | The conversation or args name a channel ("on chat", "WhatsApp", "via Gmail") | That channel     |
| 4     | Internal colleague with no channel cue                                     | Email (default)  |
| 5     | Otherwise                                                                  | Email            |

Channel choice affects message length, structure, and whether to include a sign-off. Surface the inferred channel to the user when presenting the draft (step 6); do not ask them to confirm it up front.

Internal colleagues default to email and `--channel` overrides per call; recipient-specific channel defaults could be added to the team directory later if a per-person preference emerges.

### 3. Auto-Detect Context

Scan the current conversation for relevant context to include in the message. Look for:

- **Data findings:** Numbers, statistics, query results, CSV exports mentioned
- **Code changes:** Recent deployments, commits, feature implementations
- **Decisions made:** Technical or business decisions discussed
- **Action items:** Tasks completed, things that need review or follow-up
- **Errors or issues:** Problems encountered and their resolution
- **Files created:** Exports, reports, sheets that could be attached or linked

Also check the working directory for recent relevant artifacts:

```bash
git log --oneline -5
git diff --stat HEAD
```

Search for recently modified files that might be relevant:

```
specs/*.md
*.csv
*.json (exports, reports)
```

### 4. Apply Context

Apply the detected context directly to the draft — do not ask the user to confirm it. When presenting the draft (step 6), surface a short summary of the context you used so the user can see it and correct anything in their next message:

```markdown
## Context used

- [Context item 1]
- [Context item 2]
- [Context item 3]
```

If no relevant context was found, note that and draft from the recipient and topic alone.

### 5. Draft Message

Apply the style rules below based on the identified recipient, language, and channel.

#### Style Rules

##### Defaults (apply unless a recipient block below overrides)

- **Length:** under 4 sentences for email, 1-2 sentences for chat. Exception: a multi-point summary that genuinely needs structure. When in doubt, draft the shorter version first; the user can ask to expand
- **Internal IDs:** never include UUIDs, asset IDs, DB primary keys, or internal slugs unless the user explicitly asks. Composition titles or YID codes are fine
- **Punctuation:** never use em-dashes (—) in drafts. Use comma, period, semicolon, or colon instead. Applies to every recipient and every channel
- **Pronouns:** use the recipient's established pronouns (see directory). For unknown recipients, default to they/them or rewrite to avoid pronouns until confirmed

##### English — Deby

- **Greeting:** "Hi Deby,"
- **Skip the restate:** don't echo her question or message back at her. Go straight to root cause + what you did
- **Structure:** lead with a one-sentence answer, then bullets for details if needed
- **Tone:** professional, warm, clear. Provide context before making requests
- **Sign-off (email):** "Best, Torben" (default) or "Thanks, Torben" (when requesting something)
- **Sign-off (chat):** optional; include for longer messages, skip for short ones
- **Detail level:** thorough on the answer; drop internal field names, UUIDs, and DB jargon. Composition titles or YID codes are fine
- **Formatting:** bullet points and bold for key items in longer messages

Example email to Deby:

```
Hi Deby,

I ran a check and found 2 writers that have a PRO assigned but are missing their IPI:

- Frederico Drummond, PRO: ACUM
- Marcos Sanchez Chayez, PRO: SUISA

Could you please check with Thomas?

Best,
Torben
```

Example chat to Deby:

```
Hi Deby, quick update: I've updated both writers. Thanks for checking!
```

##### English — Maru

- **Greeting:** "Hi Maru,"
- **Tone:** short, factual, no effusive thanks. A simple "Thanks!" is fine; avoid "thanks a lot for the quick turnaround" / "thanks again" / similar warmth boilerplate
- **Sign-off (email):** "Best, Torben" or just "Torben". Keep it minimal
- **Detail level:** brief. Maru handles content operations; say what you need and don't pad
- **Internal IDs:** strip composition UUIDs unless the question is *about* the UUID itself. Composition titles or YID codes preferred
- **Structure:** one or two short paragraphs; avoid bullet-heavy formatting unless listing concrete data

Example email to Maru:

```
Hi Maru,

Quick question: did you mean composition C123-FX or its linked asset? Just want to make sure I update the right one.

Thanks!
Torben
```

##### German — Julius

Adaptive tone based on message length and purpose:

- **Channel default:** for new updates (not in-thread email replies), default to Google Chat. Julius prefers chat for non-thread updates; email is fine when continuing an existing thread
- **Framing:** state the plan, don't ask permission. Replace "Should I skip these?" / "Should I do X or Y?" with "I'll do X. Let me know if you'd rather Y" whenever the obvious path is clear
- **Quick replies/reactions:** No greeting, no sign-off. Can be a single word or emoji. ("Krass", "erledigt!", "Okay, alles klar")
- **Short updates:** "Hi Julius," + brief content + "LG Torben"
- **Longer updates/data:** "Hi Julius," + structured content with bullet points + "LG Torben"
- **Emojis:** Sparingly, when natural in casual context
- **Technical content:** Can include IDs, data, specific numbers; Julius understands technical detail

Example quick reply:

```
Okay, alles klar
```

Example structured update:

```
Hi Julius,

die Daten sehen gut aus:

- 4.878 von 6.407 ISRCs haben unmatched Recordings beim MLC
- 23.688 unmatched Records insgesamt
- 91% sind exakte Titel-Matches

Anbei die CSV mit allen Details.

LG Torben
```

##### German — Lorenz

- **Greeting:** "Hi Lorenz,"
- **Tone:** Polite, concise, to the point
- **Sign-off:** "LG Torben"
- **Detail level:** Brief. Lorenz handles platform and rights operations, so provide actionable info

Example:

```
Hi Lorenz,

erledigt!

LG Torben
```

##### German — Maxi

- **Greeting:** "Hi Maxi,"
- **Tone:** Brief, casual. Maxi handles finance; keep it factual.
- **Sign-off:** "LG Torben"
- **Common pattern:** Forwarding receipts/invoices with one-line context

Example:

```
Hi Maxi,

anbei die elluminate Rechnung für Februar.

LG Torben
```

##### External Contacts

- **Language:** Ask user if not obvious from context or recipient name
- **Greeting:** "Hi," or "Hi [Name],"
- **Tone:** Professional but friendly. Full context; assume recipient has no background
- **Structure:** flowing paragraphs, not bold-prefixed numbered sections. Skip filler intros like "Quick follow-up to consolidate the open questions"; just state the question(s) directly
- **Sign-off:** "Thanks, Torben" or "Best, Torben"
- **Include:** Company context where relevant, specific details (dates, amounts, names; not internal UUIDs unless the recipient explicitly needs them)

Example:

```
Hi,

We're seeing SSL errors across all *.pex.com domains. The wildcard certificate expired today. This is blocking all API access on our end. Could you please renew the certificate?

Thanks,
Torben
```

#### Channel Adjustments

| Aspect       | Email                                                            | Chat (Google Chat / WhatsApp)             |
| ------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| Length       | See Defaults block; structure only when topic genuinely needs it | Keep concise, 1-2 sentences               |
| Structure    | Bullet points, bold headers for complex topics                   | Inline, minimal formatting                |
| Tabular data | Use bullet lists. Markdown tables paste poorly into Gmail        | Inline list with line breaks              |
| Sign-off     | Always include (Best/Thanks/LG)                                  | Optional for short messages               |
| Greeting     | Always include                                                   | Skip for quick replies in ongoing threads |
| Attachments  | Reference with "anbei" / "attached" / link                       | Share link inline                         |

#### General Rules

- Never include the email signature block (Gmail adds it automatically)
- Use "du" (informal) for all German internal communication
- Use first names only for team members
- When referencing data, include specific numbers — don't be vague
- When asking someone to do something, be explicit about what you need
- Match the complexity of the message to the topic — don't over-explain simple things

### 6. Present Draft

Present the draft **once** as the skill's final output. Do not ask the user to approve it or pick from edit options — if they want changes, they will say so in their next message, and you revise then.

Before presenting, verify the draft against the hard rules and fix silently if violated:

- No em-dashes (—) anywhere in the draft; use comma, period, semicolon, or colon
- No UUIDs, asset IDs, DB keys, or internal slugs unless the user explicitly asked; composition titles or YID codes are fine
- Language and du-form match the recipient (German: Julius, Maxi, Lorenz; English: Deby, Maru)
- Pronouns match the directory; Maru is he/him (common unisex name, easy to misgender)
- No signature block (Gmail appends it automatically)

Output, in this order:

1. The context summary from step 4 (skip if no context was found).
2. The drafted message as a clean code block (no markdown formatting artifacts, no extra whitespace) so the user can copy it.
3. A one-line note of the recipient and inferred channel. Name the actual destination for the chosen channel (Gmail for email, Google Chat for chat, WhatsApp for whatsapp):

```
Draft for [Name] via [channel]. This is a draft only; copy it into [Gmail | Google Chat | WhatsApp] to send.
```

## Handling Edge Cases

| Scenario                                             | Action                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Recipient not in directory                           | Ask for name, email, language, and relationship (internal/external)       |
| No conversation context                              | Ask user to describe what the message is about                            |
| Message is a reply                                   | Ask user to paste the message being replied to for tone matching          |
| Multiple recipients                                  | Draft for primary recipient, note CC suggestions                          |
| Mixed-language recipients (e.g. Maxi DE + CC Deby EN)| Default to English if any CC'd recipient speaks English. Confirm before drafting in German |
| Sensitive content (passwords, secrets, internal IDs) | Warn before including; strip infrastructure details for external contacts |
| User says "send it"                                  | Remind that this skill drafts only — user should copy-paste to Gmail/Chat |

## Related Skills

- Use after `/review` or `/implement` to share results with the team
- Use after data analysis sessions to communicate findings
- Pair with `/commit` workflow — draft a message about what was deployed
