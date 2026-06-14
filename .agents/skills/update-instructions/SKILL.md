---
name: update-instructions
description: Update CLAUDE.md to reflect meaningful codebase changes. Analyzes git history since the last documented update, decides whether changes warrant documentation, and makes minimal best-practice edits; leaves changes uncommitted for review. Use when the user asks to update or refresh CLAUDE.md or the project instructions, says the docs are stale or out of date, asks whether CLAUDE.md is current, or after a stretch of merged work. Not for creating a new CLAUDE.md (use /init) and not for settings.json changes (use update-config).
allowed-tools:
  - Edit
  - WebFetch
  - mcp__Ref__ref_search_documentation
  - mcp__Ref__ref_read_url
argument-hint: "[--force] [--dry-run]"
---

# Update Instructions Skill

Update CLAUDE.md to reflect meaningful codebase changes while avoiding common AI documentation pitfalls.

## Usage

- `/update-instructions` - Analyze changes and update CLAUDE.md if needed
- `/update-instructions --force` - Update even if no meaningful changes detected
- `/update-instructions --dry-run` - Show what would change without editing

## Core Principles

Based on Anthropic best practices and research on effective CLAUDE.md files:

| Principle                    | Rationale                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| Less is more                 | LLMs reliably follow ~150-200 instructions max                            |
| Edit, don't expand           | Only modify existing sections; never add new ones (except major features) |
| Patterns over implementation | Document concepts, not code details                                       |
| Pointers over copies         | Use `file:line` references instead of inline code snippets                |
| Universal applicability      | Task-specific content belongs in separate docs                            |
| No temporal language         | Avoid "new", "recently", "now" - they become stale                        |

## Process

### 1. Find Last Update

Anchor on the last commit that touched CLAUDE.md, cross-checked against the skill's commit convention:

```bash
git log -1 --format='%H %ci %s' -- <path-to-CLAUDE.md>
git log --oneline --grep="chore(instructions):" -1
```

Use the newer of the two as the baseline — manual CLAUDE.md edits won't carry the prefix, and the grep can false-match reverts. If neither exists, propose a bounded baseline (e.g., last 30 days or the last release tag) and confirm with the user instead of analyzing the entire history.

### 2. Analyze Changes Since Last Update

Get the diff to understand what changed:

```bash
git log --oneline <last-update-sha>..HEAD
git diff --stat <last-update-sha>..HEAD
```

**Categorize changes by relevance to CLAUDE.md:**

| Category             | Examples                                                              | Action              |
| -------------------- | --------------------------------------------------------------------- | ------------------- |
| **High relevance**   | New directories, tech stack changes, new APIs, infrastructure changes | Likely needs update |
| **Medium relevance** | Major features, new patterns, workflow changes                        | May need update     |
| **Low relevance**    | Bug fixes, refactoring, dependency updates, tests                     | Usually skip        |
| **No relevance**     | Style changes, typos, comments                                        | Always skip         |

### 3. Map Changes to CLAUDE.md Sections

Read the current CLAUDE.md:

```bash
# Find CLAUDE.md location
find . -name "CLAUDE.md" -not -path "*/node_modules/*" | head -1
```

For each high/medium relevance change, determine:

1. Which section of CLAUDE.md it affects (if any)
2. Whether the current content already covers it
3. Whether an update would add value

### 4. Determine If Update Is Needed

**Report "no updates needed" if:**

- All changes are low/no relevance
- Current CLAUDE.md already covers the changes adequately
- Changes are at a lower abstraction level than CLAUDE.md documents

**Example reasoning:**

> "The 15 commits since the last update include: 8 bug fixes, 4 dependency updates, 2 test additions, and 1 new utility function. None of these warrant CLAUDE.md updates because:
>
> - Bug fixes don't change patterns or conventions
> - Dependency updates are handled by package managers
> - The new utility function follows existing patterns already documented"

### 5. Make Minimal Edits

If updates are warranted:

**DO:**

- Edit existing table rows to reflect changes
- Update file paths if they moved
- Adjust version numbers or tool names
- Fix any format inconsistencies found

**DON'T:**

- Add new sections (unless major new feature/domain)
- Add explanatory paragraphs
- Include code snippets (use `file:line` pointers)
- Add temporal language ("new", "recently added")
- Document implementation details

**Edit size guidance:**

- Most updates should change < 10 lines
- If you're adding > 20 lines, reconsider if it's necessary
- Deletions are often better than additions

### 6. Validate Format

Check the updated CLAUDE.md for:

| Check                        | Fix                       |
| ---------------------------- | ------------------------- |
| Broken table formatting      | Align columns, fix pipes  |
| Inconsistent heading levels  | Match existing structure  |
| Missing blank lines          | Add where needed          |
| Overly long lines in tables  | Abbreviate or restructure |
| Code blocks without language | Add language identifier   |

### 7. Report Summary

Provide a summary of what was done:

```markdown
## CLAUDE.md Update Summary

### Changes Made

| Section          | Change                         | Lines  |
| ---------------- | ------------------------------ | ------ |
| Repository Map   | Updated dataflow/ paths        | +2, -1 |
| Domain Specifics | Added new API endpoint pattern | +1     |

### Validation

- Format: OK
- Length: 287 lines (< 300 recommended max)
- Tables: 12 (all properly formatted)

### Next Steps

1. Review: `git diff CLAUDE.md`
2. Commit: `/commit` (will use `chore(instructions):` format)
```

## Anti-Patterns

**The skill must avoid these common AI documentation mistakes:**

| Anti-Pattern               | Example                                         | Why It's Bad                                  |
| -------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Over-elaboration           | Adding 3 paragraphs to explain a simple pattern | Bloats context, reduces instruction-following |
| Implementation details     | Documenting function internals                  | Wrong abstraction level, gets stale           |
| Stale code snippets        | Inline code that doesn't match reality          | Misleads, causes errors                       |
| Temporal references        | "The new authentication system..."              | Meaningless after a week                      |
| Redundant content          | Same info in multiple sections                  | Wastes precious context space                 |
| Task-specific instructions | "When migrating databases, do X"                | Not universally applicable                    |

## Commit Convention

When the user commits these changes (via `/commit` or manually), use:

```
chore(instructions): <brief description>

Examples:
- chore(instructions): update DRM domain patterns
- chore(instructions): reflect new API structure
- chore(instructions): fix table formatting in hints log
```

This format allows the skill to find its previous updates via `git log --grep`.

## Edge Cases

| Scenario                             | Action                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| No CLAUDE.md exists                  | Inform user, do not create one                             |
| CLAUDE.md is very long (> 500 lines) | Suggest condensing, but don't auto-condense                |
| Major architectural change           | Allow adding new section, but keep it minimal              |
| No previous skill commits            | Use oldest reasonable baseline or ask user                 |
| Conflicting information              | Prefer current codebase over CLAUDE.md, update accordingly |

## Gotchas

- The `--grep="chore(instructions):"` anchor matches any commit message containing the string — including `Revert "chore(instructions): ..."` — and misses CLAUDE.md edits committed without the prefix. Cross-check with `git log -1 --format='%H %ci' -- <CLAUDE.md path>` and use the newer of the two as the baseline.
- `/commit` does not know this convention (its SKILL.md never mentions `chore(instructions):`); when committing in a later session, state the prefix explicitly or the next run mis-anchors.
- `find . -name "CLAUDE.md" | head -1` returns an arbitrary match in repos with nested CLAUDE.md files, and never sees user-level (`~/.claude/CLAUDE.md`) or parent-directory CLAUDE.md files that load hierarchically. If more than one candidate exists, confirm the target with the user.
- The "~150-200 instructions" and "< 300 lines" figures are uncited snapshots; before leaning on them in user-facing reasoning, refresh via `mcp__Ref__ref_search_documentation` ("Claude Code CLAUDE.md memory best practices") or WebFetch the official docs — both are already in allowed-tools.

## Best Practices Reference

These guidelines are derived from Anthropic's official documentation and community research:

1. **Concise and human-readable** - Every word should add value
2. **Tables over prose** - Quick reference is better than paragraphs
3. **Patterns, not rules** - Use "typically" not "ALWAYS"
4. **Progressive disclosure** - Keep detailed docs separate, reference them
5. **Iterate like a prompt** - The CLAUDE.md is prompt engineering
6. **Universal applicability** - Goes into every session, must be relevant

## Related Skills

- `/commit` - Commit the changes with proper format
- `/review` - Review changes before committing
- `/spec` - For major new features that might need CLAUDE.md sections
