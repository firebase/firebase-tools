---
name: setup-statusline
description: Install and configure ccstatusline with the YourVid team standard status line layout (model | repo | branch | cost | context % | rate limits). Use when the user wants a status line or statusline in Claude Code, mentions ccstatusline, or asks to see cost, context usage, or rate-limit windows in the terminal UI — even if they don't name the tool. Detects existing configs, offers interactive customization or quick defaults, and verifies the setup works.
allowed-tools:
  - Bash(which:*)
  - Bash(npm i -g ccstatusline)
  - Bash(mkdir:*)
  - Bash(date:*)
  - Bash(echo:*)
  - Bash(ccstatusline:*)
  - Bash(jq:*)
  - Write
  - Edit
argument-hint: "[--defaults]"
---

# Setup Statusline Skill

Install and configure the YourVid team standard Claude Code status line using ccstatusline.

**Output format:** `<model> | <repo> | <branch> | $<cost> | <context>% | <5h-window> <5h>% <7d-window> <7d>%`

## Usage

- `/setup-statusline` - Interactive setup with customization questions
- `/setup-statusline --defaults` - Skip questions, apply YourVid defaults immediately

## Process

### 1. Check for Existing Configuration

Read `~/.claude/settings.json` and check if a `statusLine` key already exists.

**If statusLine exists:**

Show the current configuration to the user and ask via AskUserQuestion:

> "You already have a statusLine configured: `<current value>`. Do you want to replace it with the YourVid team standard? (yes/no)"

If the user says no, exit with: "No changes made. Your existing statusline is unchanged."

**If no statusLine exists:** Proceed to step 2.

**If `~/.claude/settings.json` does not exist:** Proceed to step 2 (it will be created in step 5b).

### 2. Check for jq

```bash
which jq
```

If jq is not found, report: "jq is required but not installed. Install it with `brew install jq` (macOS) or your package manager, then run this skill again." — and stop.

### 3. Install ccstatusline

```bash
which ccstatusline
```

If ccstatusline is already installed, skip to step 4.

If not installed:

```bash
npm i -g ccstatusline
```

Verify installation:

```bash
which ccstatusline
```

If installation fails:

- If npm is not found: "npm is not available. Install Node.js first, then run this skill again."
- If permission error: "Installation failed — check the Node setup first (`asdf reshim nodejs`, npm prefix permissions); `sudo npm i -g ccstatusline` only as a last resort (creates root-owned npm dirs)"
- Stop on any failure.

### 4. Customization

**If `--defaults` was passed:** Skip all questions. Use these YourVid defaults:

| Setting                       | Default       |
| ----------------------------- | ------------- |
| Model color                   | cyan          |
| Git repo color                | blue          |
| Git branch color              | magenta       |
| Cost color                    | brightBlack   |
| Context grey threshold        | < 50%         |
| Context yellow threshold      | < 75%         |
| Context red threshold         | >= 75% (bold) |
| Rate limit grey threshold     | < 50%         |
| Rate limit yellow threshold   | < 80%         |
| Rate limit red threshold      | >= 80% (bold) |

Context thresholds are tuned for 1M context models. On 200k models, overhead consumes ~15-20% invisibly — users on those models may want lower thresholds (e.g., 25/55).

Proceed directly to step 5.

**Otherwise, ask these questions via AskUserQuestion:**

**Question 1 — Context thresholds:**

> "Context % thresholds (tuned for 1M context). Defaults: grey < 50%, yellow < 75%, red >= 75%. Accept defaults or provide two numbers (e.g., '40 70')?"

Parse the response:

- "yes", "defaults", or empty → use defaults (50, 75)
- Two numbers → use as grey-threshold and yellow-threshold

**Question 2 — Rate limit thresholds:**

> "Rate limit thresholds for the 5-hour and 7-day usage windows. Defaults: grey < 50%, yellow < 80%, bold red >= 80%. Accept defaults or provide two numbers (e.g., '40 70')?"

Parse the response:

- "yes", "defaults", or empty → use defaults (50, 80)
- Two numbers → use as grey-threshold and yellow-threshold

**Question 3 — Widget colors:**

> "Widget colors. Defaults: model=cyan, repo=blue, branch=magenta, cost=brightBlack. Accept defaults or customize (e.g., 'model:green branch:yellow')? Options: cyan, blue, magenta, green, yellow, white, brightBlack"

Parse the response:

- "yes", "defaults", or empty → use defaults
- Custom format → parse individual colors, use defaults for unspecified widgets

### 5. Write Configuration Files

Use the user's chosen values (or defaults) to write all files.

#### 5a. Write ccstatusline config

Create directory if needed:

```bash
mkdir -p ~/.config/ccstatusline
```

Write `~/.config/ccstatusline/settings.json` using the Write tool. Substitute `MODEL_COLOR`, `REPO_COLOR`, `BRANCH_COLOR`, `COST_COLOR`, `CTX_GREY_THRESHOLD`, `CTX_YELLOW_THRESHOLD`, `RL_GREY_THRESHOLD`, `RL_YELLOW_THRESHOLD` with the user's chosen values:

```json
{
  "version": 3,
  "lines": [
    [
      {
        "id": "1",
        "type": "custom-command",
        "color": "MODEL_COLOR",
        "commandPath": "jq -r '.model.display_name // .model.id // \"unknown\"' | tr '[:upper:]' '[:lower:]' | sed 's/^claude //;s/^claude-//;s/ ([^)]*context)//'"
      },
      {
        "id": "2",
        "type": "git-root-dir",
        "color": "REPO_COLOR",
        "rawValue": true,
        "metadata": {
          "hideNoGit": "true"
        }
      },
      {
        "id": "3",
        "type": "git-branch",
        "color": "BRANCH_COLOR",
        "rawValue": true,
        "metadata": {
          "hideNoGit": "true"
        }
      },
      {
        "id": "4",
        "type": "custom-command",
        "color": "COST_COLOR",
        "commandPath": "jq -r '.cost.total_cost_usd // empty | . * 100 | round / 100 | tostring | split(\".\") | if length == 1 then \"\\(.[0]).00\" elif (.[1] | length) == 1 then \"\\(.[0]).\\(.[1])0\" else \"\\(.[0]).\\(.[1])\" end' | awk '{printf \"$%s\",$1}'"
      },
      {
        "id": "5",
        "type": "custom-command",
        "color": "white",
        "commandPath": "jq -r '.context_window.used_percentage // empty' | awk '{if($1<CTX_GREY_THRESHOLD)printf \"\\033[90m%.0f%%\\033[0m\",$1;else if($1<CTX_YELLOW_THRESHOLD)printf \"\\033[33m%.0f%%\\033[0m\",$1;else printf \"\\033[1;31m%.0f%%\\033[0m\",$1}'",
        "preserveColors": true
      },
      {
        "id": "6",
        "type": "custom-command",
        "color": "white",
        "commandPath": "jq -r 'if .rate_limits then def fmt: if . >= 86400 then \"\\(. / 86400 | floor)d\" elif . >= 3600 then \"\\(. / 3600 | floor)h\" elif . >= 60 then \"\\(. / 60 | floor)m\" else \"0m\" end; (if .rate_limits.five_hour.resets_at then ((.rate_limits.five_hour.resets_at) - now | if . > 0 then fmt else \"5h\" end) else \"5h\" end) as $hl | (if .rate_limits.seven_day.resets_at then ((.rate_limits.seven_day.resets_at) - now | if . > 0 then fmt else \"7d\" end) else \"7d\" end) as $dl | \"\\(.rate_limits.five_hour.used_percentage // -1) \\($hl) \\(.rate_limits.seven_day.used_percentage // -1) \\($dl)\" else empty end' | awk '{h=$1;hl=$2;d=$3;dl=$4; if(h<0&&d<0)exit; if(h<0){hp=\"--\";hc=\"\\033[90m\"} else if(h<RL_GREY_THRESHOLD){hp=sprintf(\"%.0f%%\",h);hc=\"\\033[90m\"} else if(h<RL_YELLOW_THRESHOLD){hp=sprintf(\"%.0f%%\",h);hc=\"\\033[33m\"} else{hp=sprintf(\"%.0f%%\",h);hc=\"\\033[1;31m\"}; if(d<0){dp=\"--\";dc=\"\\033[90m\"} else if(d<RL_GREY_THRESHOLD){dp=sprintf(\"%.0f%%\",d);dc=\"\\033[90m\"} else if(d<RL_YELLOW_THRESHOLD){dp=sprintf(\"%.0f%%\",d);dc=\"\\033[33m\"} else{dp=sprintf(\"%.0f%%\",d);dc=\"\\033[1;31m\"}; printf \"\\033[2;36m%s\\033[0m %s%s\\033[0m \\033[2;35m%s\\033[0m %s%s\\033[0m\",hl,hc,hp,dl,dc,dp}'",
        "preserveColors": true
      }
    ],
    [],
    []
  ],
  "defaultSeparator": "|",
  "flexMode": "full-minus-40",
  "compactThreshold": 60,
  "colorLevel": 2,
  "inheritSeparatorColors": false,
  "globalBold": false,
  "powerline": {
    "enabled": false,
    "separators": [""],
    "separatorInvertBackground": [false],
    "startCaps": [],
    "endCaps": [],
    "autoAlign": false
  }
}
```

#### 5b. Update Claude Code settings

Read `~/.claude/settings.json` using the Read tool.

- **If the file exists:** Use the Edit tool to add or replace only the `statusLine` key. Preserve all other existing keys unchanged.
- **If the file does not exist:** Use the Write tool to create it with this content:

```json
{
  "statusLine": {
    "type": "command",
    "command": "ccstatusline",
    "padding": 0
  }
}
```

The `statusLine` value is always:

```json
{
  "type": "command",
  "command": "ccstatusline",
  "padding": 0
}
```

### 6. Verify

Run a verification test by piping sample Claude Code JSON through ccstatusline:

```bash
echo '{"model":{"display_name":"Claude Opus X.Y (1M context)"},"cost":{"total_cost_usd":0.42},"context_window":{"used_percentage":35.7},"rate_limits":{"five_hour":{"used_percentage":23.5,"resets_at":FIVE_H_RESET},"seven_day":{"used_percentage":71.2,"resets_at":SEVEN_D_RESET}},"cwd":"/Users/test/project"}' | ccstatusline
```

Replace `FIVE_H_RESET` and `SEVEN_D_RESET` with Unix timestamps a few hours/days in the future (e.g., using `$(date -v+2H +%s)` and `$(date -v+3d +%s)` on macOS, or `$(date -d '+2 hours' +%s)` and `$(date -d '+3 days' +%s)` on Linux).

If ccstatusline produces output without errors, show the output to the user. With default thresholds, context at 35.7% should appear grey, 5h at 23.5% should appear grey with a dynamic time label (e.g., "2h"), and 7d at 71.2% should appear yellow with a dynamic time label (e.g., "3d").

If it fails, report the error and suggest the user check the ccstatusline installation.

### 7. Done

Report to the user:

> Setup complete! Your status line will show:
>
> `opus x.y | project | branch | $0.42 | 35% | 2h 23% 3d 71%`
>
> Widgets: model (lowercase, context label stripped), git repo, git branch, session cost (2 decimal places), context % (traffic light colors), rate limits (dynamic time-until-reset labels with traffic light colors, hidden for API key users).
>
> **Restart Claude Code** for the status line to appear.

## Gotchas

- Default context thresholds (50/75) are tuned for 1M-context models; on 200k models overhead consumes ~15-20% invisibly — suggest lower thresholds (e.g., 25/55).
- On asdf-managed Node, `which ccstatusline` can miss the binary right after `npm i -g` until shims regenerate (`asdf reshim nodejs`). Prefer that over `sudo npm i -g`, which creates root-owned npm dirs.
- The verify fixture is single-quoted, so `$(date ...)` does NOT expand inside it. Close the quote around the substitution (e.g., `"resets_at":'$(date -v+2H +%s)'`) — a literal `$(...)` makes the JSON invalid and the rate-limits widget silently renders empty.
- The rate-limits widget is hidden entirely for API-key users (`rate_limits` absent from stdin JSON); its absence after setup is not a bug.
- The new status line appears after your next interaction (settings reload automatically) — an unchanged prompt line immediately after setup is expected, not a failure.
- The traffic-light scheme deliberately uses grey (not green) for the all-good state and dim cyan/magenta labels: the statusline should stay quiet and only draw the eye on yellow/red. Preserve this intent when users customize.

## Widget Reference

| Position | Widget       | Description                                                                                        |
| -------- | ------------ | -------------------------------------------------------------------------------------------------- |
| 1        | Model        | Current model name, lowercase, "Claude" prefix and context labels stripped (custom-command with jq+sed) |
| 2        | Git repo     | Repository root directory name (git-root-dir, hidden outside git)                                  |
| 3        | Git branch   | Current branch name (git-branch, hidden outside git)                                               |
| 4        | Session cost | Running session cost in USD, always 2 decimal places (custom-command with jq)                      |
| 5        | Context %    | Context window usage with traffic light colors: grey < 50%, yellow < 75%, bold red >= 75%          |
| 6        | Rate limits  | 5-hour and 7-day usage windows with dynamic time-until-reset labels (e.g., "2h 23% 3d 71%"). Grey < 50%, yellow < 80%, bold red >= 80%. Labels in dim cyan/magenta. Falls back to static "5h"/"7d" when resets_at is absent. Hidden entirely when rate_limits absent (API key users). Shows "--" if one window is missing. |

## Error Handling

| Scenario                                | Action                                         |
| --------------------------------------- | ---------------------------------------------- |
| npm not available                       | Report error, suggest installing Node.js, stop |
| jq not available                        | Report error, suggest `brew install jq`, stop  |
| ccstatusline install fails              | Check Node setup (`asdf reshim nodejs`, npm prefix perms); `sudo` only as last resort; stop |
| `~/.claude/settings.json` missing       | Create with statusLine config only             |
| `~/.config/ccstatusline/` missing       | Create directory                               |
| User declines replacing existing config | Exit with no changes                           |
| Verification fails                      | Report error, suggest checking installation    |
