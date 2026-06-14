---
name: research
description: Generate a structured deep-research PROMPT file from conversation context — prepares the prompt, does not run the research. Extracts technical constraints, problem history, decision criteria, and domain knowledge into a universal prompt for external deep research tools (Claude, ChatGPT, Gemini). Use when the user wants to hand a question off to an external research tool — "create a research prompt", "prep this for deep research", "turn this conversation into a prompt for ChatGPT/Gemini" — or wants session context exported for research. Do NOT use when the user wants the research performed in this session; that is the deep-research skill.
allowed-tools:
  - Write
  - Bash(date:*)
  - Bash(mkdir:*)
argument-hint: "[<research question>]"
---

# Research Skill

Generate structured prompts for external deep research tools (Claude, ChatGPT, Gemini) by extracting and organizing context from the current Claude Code session.

## Usage

- `/research` - Extract context interactively and generate research prompt
- `/research "<question>"` - Generate prompt with provided research question

## Gotchas

- The generated prompt is destined for EXTERNAL tools (ChatGPT, Gemini, claude.ai). Context extraction deliberately pulls integrations, compliance/security requirements, and `file:line` code references — during the refinement step, explicitly flag any item containing secrets, credentials, internal URLs, or customer-identifying detail before it is exported.
- Take the year from the `date` output, never from memory: the template's Time Frame line ([CURRENT_YEAR-1]-[CURRENT_YEAR]) silently anchors the entire research to the wrong years if guessed.
- The user wants a prompt artifact, not answers — do not start answering the research question yourself; if they want the research run inside this session, that is the deep-research skill.
- Before reporting done, re-read the saved file and confirm no unfilled [bracket] placeholders survived from the template.
- A recurring question may already have a file in research/ — the timestamp-suffix rule in step 8 exists so a rerun never silently overwrites the earlier prompt.

## Process

### 1. Get Current Date

```bash
date +%Y-%m-%d
```

Store the date for inclusion in the generated prompt. Use the year to calculate time frame references.

### 2. Extract Context from Conversation

Analyze the conversation history and extract context into four categories:

#### Technical Constraints

Look for and extract:

- Tech stack, frameworks, languages mentioned
- Architecture patterns discussed (monolith, microservices, serverless, etc.)
- Dependencies or integrations referenced
- Performance/scale requirements stated
- Existing code patterns (include `file:line` references where discussed)
- Infrastructure constraints (cloud provider, deployment model, etc.)

#### Problem History

Look for and extract:

- Previous approaches that were tried
- Errors or failures encountered
- Solutions that were rejected and why
- Time/effort already invested
- What's currently not working

#### Decision Criteria

Look for and extract:

- Explicit tradeoffs mentioned ("we need X but also Y")
- Priority statements (performance vs. simplicity, cost vs. features)
- Hard constraints ("must support X", "cannot use Y")
- Timeline or deadline pressures
- Team capabilities or preferences

#### Domain Knowledge

Look for and extract:

- Business context or requirements
- User needs discussed
- Compliance, security, or regulatory requirements
- Team or organizational constraints
- Non-technical stakeholder concerns

### 3. Present Context for Refinement

Display the extracted context grouped by category:

```markdown
## Extracted Context

### Technical Constraints

- [item 1]
- [item 2]

### Problem History

- [item 1]

### Decision Criteria

- [item 1]

### Domain Knowledge

- [item 1]

---

**Is this context accurate?** You can:

- Add items I missed
- Remove items that aren't relevant
- Edit items that need clarification
```

Use `AskUserQuestion` to allow refinement:

- Confirm context is correct
- Add missing context
- Remove irrelevant items
- Edit for clarity

Continue refining until user confirms the context is complete.

### 4. Capture Research Question

**If question provided as argument:** Use it directly.

**If no argument:** Ask the user:

```
What research question should this prompt address?

Consider:
- What decision are you trying to make?
- What information would help you move forward?
- What best practices or approaches do you need to understand?
```

### 5. Determine Output Format

Based on the research question pattern, suggest an appropriate format:

| Question Pattern                           | Suggested Format                    |
| ------------------------------------------ | ----------------------------------- |
| "What's the best..." / "Which approach..." | Comparison table + recommendation   |
| "How do I..." / "What's the right way..."  | Step-by-step guide + best practices |
| "Should we..." / "Is it worth..."          | Decision matrix with pros/cons      |
| "What are the options for..."              | Comprehensive overview + comparison |
| "Why is X happening..."                    | Root cause analysis format          |
| General/unclear                            | Comprehensive report with sections  |

### 6. Generate Research Prompt

Create the prompt using this template:

```markdown
# Deep Research Request

**Date:** [YYYY-MM-DD from step 1]
**Topic:** [Derived from research question]

---

## 1. CONTEXT (Background & Situation)

### Technical Environment

[Insert Technical Constraints - formatted as bullet points]

### Problem History

[Insert Problem History - formatted as bullet points]

### Decision Criteria

[Insert Decision Criteria - formatted as bullet points]

### Domain Context

[Insert Domain Knowledge - formatted as bullet points]

---

## 2. RESEARCH QUESTION

### Primary Question

[The main research question]

### Sub-Questions

- [Derived sub-question 1 - break down the main question]
- [Derived sub-question 2]
- [Derived sub-question 3]

### Hypothesis (What I Expect to Find)

[Based on context, what the user might expect - to be validated or refuted]

---

## 3. SPECIFICATIONS & CONSTRAINTS

- **Time Frame:** Focus on [CURRENT_YEAR-1]-[CURRENT_YEAR] practices and recommendations.
- **Source Priority:**
  - Official documentation and specifications
  - Peer-reviewed papers and technical reports
  - Authoritative technical blogs (engineering blogs from major companies)
  - Community best practices with evidence of adoption
- **Exclusions:**
  - Outdated approaches superseded by current best practices
  - Opinions without supporting evidence
  - [Any specific exclusions from context]

---

## 4. OUTPUT REQUIREMENTS

- **Format:** [Selected format from step 5]
- **Depth:** Executive summary followed by detailed analysis
- **Audience:** Technical team making implementation decisions
- **Include:**
  - Comparison of viable options with clear differentiation
  - Pros and cons for each approach
  - Code examples or configuration snippets where relevant
  - Performance/scalability considerations
  - Migration or adoption complexity
  - Links to authoritative sources for further reading

---

## 5. SUCCESS CRITERIA

This research is complete when:

- [ ] Primary question is answered with actionable recommendations
- [ ] At least 3 viable approaches are compared (if applicable)
- [ ] Trade-offs are clearly articulated for our specific context
- [ ] Recommendations are supported by evidence from authoritative sources
- [ ] Implementation complexity is assessed for each option

---

## 6. HANDLING UNCERTAINTY

If specific data or best practices are unavailable:

- **Explicitly state** what information could not be found
- **Do NOT estimate or guess** - clearly mark gaps as "Information not found"
- **Suggest alternatives** for finding the missing information
- **Indicate confidence level** (High/Medium/Low) for each recommendation
- **Note recency** - flag if the most recent information is older than 12 months
```

### 7. Generate Filename

Derive filename from the research question:

1. Extract key terms from the question
2. Convert to lowercase kebab-case
3. Append `-research.md`

Examples:

- "What's the best caching strategy?" → `caching-strategy-research.md`
- "Should we use GraphQL or REST?" → `graphql-vs-rest-research.md`
- "How to implement authentication?" → `authentication-implementation-research.md`

### 8. Save and Report

Create the `research/` directory if it doesn't exist, then save:

```bash
mkdir -p research
```

Write the prompt to `research/<filename>.md`.

If file exists, append timestamp: `<filename>-YYYYMMDD-HHMMSS.md`

Report to user:

```markdown
## Research Prompt Generated

**Saved to:** `research/<filename>.md`

### Quick Summary

- **Question:** [Primary question]
- **Context Categories:** [X] technical, [X] history, [X] criteria, [X] domain
- **Output Format:** [Selected format]
```

## Handling Minimal Context

If the conversation has insufficient context (new session or off-topic history):

### Gather Context Interactively

Use `AskUserQuestion` to gather each category:

**Technical Environment:**

```
What's your current technical setup?
- Tech stack (languages, frameworks, databases)
- Architecture pattern (monolith, microservices, etc.)
- Key dependencies or integrations
- Any performance/scale requirements
```

**Problem History:**

```
What have you already tried or considered?
- Previous approaches and why they didn't work
- Current pain points or blockers
- Time/effort already invested
```

**Decision Criteria:**

```
What are your constraints and priorities?
- Must-have requirements
- Nice-to-have features
- Trade-offs you're willing to make (speed vs. quality, cost vs. features)
```

**Domain Context:**

```
Any business or organizational context?
- Who are the users/stakeholders?
- Compliance or security requirements
- Team constraints or preferences
```

## Codebase Analysis (Optional)

If the research question relates to the current codebase, use the **Explore agent** (via Task tool with `subagent_type: Explore`) to gather additional technical context:

```
# Example: Launch Explore agent for codebase analysis
Task(Explore): "Analyze the codebase to understand:
1. Current architecture patterns in use
2. Existing solutions for [relevant area]
3. Dependencies and their versions
4. Any configuration or conventions that would affect [research topic]"
```

Include relevant findings in the Technical Constraints section.

## Error Handling

| Scenario                           | Action                              |
| ---------------------------------- | ----------------------------------- |
| User provides no question          | Ask interactively                   |
| Context extraction finds nothing   | Switch to interactive gathering     |
| User rejects all extracted context | Ask what context should be included |
| Research question too vague        | Ask clarifying questions            |
| File write fails                   | Report error, suggest manual copy   |

## Related Skills

- Use `/spec` if research leads to a feature that needs specification
- After receiving research reports, paste them back into Claude Code for synthesis and decision-making
