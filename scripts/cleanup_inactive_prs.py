#!/usr/bin/env python3
"""Automated inactivity lifecycle management for pull requests on firebase-tools.

Workflow:
1. Evaluates existing PRs labeled 'inactive':
   - Resets and removes the 'inactive' label if author activity (commit or comment) occurred after tagging.
   - Automatically closes PRs where >= 5 days have elapsed with no new activity.
2. Discovers open PRs inactive for >= 60 days:
   - Skips protected branches (e.g. ai-improve-* Buganizer tasks, DO NOT MERGE).
   - Applies the 'inactive' label and posts a 5-day warning notification.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_REPO = "firebase/firebase-tools"
INACTIVE_LABEL = "inactive"
DEFAULT_INACTIVE_DAYS = 60.0
DEFAULT_GRACE_DAYS = 5.0
DEFAULT_TAG_LIMIT = 30
DEFAULT_CLOSE_LIMIT = 50

# Automated bot authors to exclude from user activity checks
BOT_USERS = {
    "google-oss-bot",
    "gemini-code-assist",
    "github-actions",
    "github-actions[bot]",
    "cla-bot",
    "google-cla",
    "firebase-release",
}

DEPENDABOT_USERS = {
    "dependabot",
    "dependabot[bot]",
    "app/dependabot",
}

# Labels that protect a PR from being marked inactive
EXEMPT_LABELS = {
    "DO NOT MERGE",
    "ongoing",
    "pinned",
}

PRS_QUERY = """
query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(first: 50, after: $cursor, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        number
        title
        url
        createdAt
        headRefName
        author {
          __typename
          login
        }
        labels(first: 20) {
          nodes {
            name
          }
        }
        comments(last: 10) {
          totalCount
          nodes {
            createdAt
            author {
              __typename
              login
            }
          }
        }
        commits(last: 1) {
          totalCount
          nodes {
            commit {
              committedDate
              author {
                user {
                  login
                }
              }
            }
          }
        }
        reviews(last: 5) {
          totalCount
          nodes {
            submittedAt
            author {
              __typename
              login
            }
            state
          }
        }
        timelineItems(itemTypes: [REOPENED_EVENT, UNLABELED_EVENT], last: 5) {
          nodes {
            __typename
            ... on ReopenedEvent {
              createdAt
            }
            ... on UnlabeledEvent {
              createdAt
              label {
                name
              }
            }
          }
        }
      }
    }
  }
}
"""

TIMELINE_QUERY = """
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number
      title
      url
      author {
        __typename
        login
      }
      timelineItems(itemTypes: [LABELED_EVENT, UNLABELED_EVENT, REOPENED_EVENT, ISSUE_COMMENT, PULL_REQUEST_COMMIT], last: 100) {
        nodes {
          __typename
          ... on LabeledEvent {
            createdAt
            label {
              name
            }
          }
          ... on UnlabeledEvent {
            createdAt
            label {
              name
            }
          }
          ... on ReopenedEvent {
            createdAt
          }
          ... on IssueComment {
            createdAt
            author {
              __typename
              login
            }
          }
          ... on PullRequestCommit {
            commit {
              committedDate
              author {
                user {
                  login
                }
              }
            }
          }
        }
      }
    }
  }
}
"""

TAG_WARNING_COMMENT = """{greeting}

Thank you for your contribution to `firebase-tools`. Because there has been no recent activity on this pull request for over {days_inactive} days, we are marking it as `{label}`.

**What happens next?**
- If you would like to keep this PR open, please leave a comment or push an update within the next **{grace_days} days**, and the `{label}` label will be automatically removed.
- If we do not hear from you within {grace_days} days, this PR will be automatically closed to keep our backlog manageable.

If you need more time or have questions, just let us know. You are always welcome to reopen or submit a fresh pull request in the future. Thank you!"""

DEPENDABOT_WARNING_COMMENT = """Marking this Dependabot pull request as `{label}` due to {days_inactive} days of inactivity. This PR will be automatically closed in {grace_days} days if not merged or updated."""

CLOSURE_COMMENT = """Closing this pull request after {grace_days} days of inactivity following the `{label}` notification.

Thank you for contributing to `firebase-tools`! If you would like to continue working on this change, please leave a comment asking a maintainer to reopen this pull request (before rebasing or force-pushing), or feel free to open a new pull request. We appreciate your time!"""

ACTIVITY_DETECTED_COMMENT = """Activity detected on this pull request! Removing the `{label}` label. Thank you for your continued contribution!"""


def get_nested(d: Any, *keys: str, default: Any = None) -> Any:
    """Safely retrieves nested dictionary keys guarding against None intermediate values."""
    for key in keys:
        if isinstance(d, dict):
            d = d.get(key)
        else:
            return default
    return d if d is not None else default


def parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(dt_str)
    except (ValueError, TypeError):
        return None


def run_gh_graphql(query: str, variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    if variables:
        for k, v in variables.items():
            if isinstance(v, int):
                cmd.extend(["-F", f"{k}={v}"])
            else:
                cmd.extend(["-f", f"{k}={v}"])

    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"GitHub GraphQL query failed: {res.stderr.strip()}")

    try:
        res_json = json.loads(res.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse GraphQL response as JSON: {e}. Output: {res.stdout}") from e

    if "errors" in res_json:
        raise RuntimeError(f"GitHub GraphQL query returned errors: {json.dumps(res_json['errors'])}")

    return res_json


def fetch_all_open_prs(owner: str, repo: str) -> List[Dict[str, Any]]:
    cursor = None
    all_prs: List[Dict[str, Any]] = []

    page = 1
    while True:
        vars_dict: Dict[str, Any] = {"owner": owner, "repo": repo}
        if cursor:
            vars_dict["cursor"] = cursor
        data = run_gh_graphql(PRS_QUERY, vars_dict)
        pr_connection = data["data"]["repository"]["pullRequests"]
        nodes = pr_connection.get("nodes", [])
        all_prs.extend(nodes)
        print(f"  Fetched page {page} ({len(nodes)} PRs, total so far: {len(all_prs)})...")

        page_info = pr_connection.get("pageInfo", {})
        if not page_info.get("hasNextPage"):
            break
        cursor = page_info.get("endCursor")
        page += 1
        time.sleep(0.2)

    return all_prs


def get_last_activity(pr: Dict[str, Any]) -> Tuple[str, datetime]:
    dates: List[Tuple[str, datetime]] = []

    created_at = pr.get("createdAt")
    if created_at:
        dt = parse_iso(created_at)
        if dt is not None:
            dates.append(("created", dt))

    pr_author = get_nested(pr, "author", "login", default="")

    commits = get_nested(pr, "commits", "nodes", default=[])
    if commits:
        committed_date = get_nested(commits[0], "commit", "committedDate")
        c_author = get_nested(commits[0], "commit", "author", "user", "login")
        # When author git email is unlinked, c_author is None/"" -> treat as valid human activity.
        # On Dependabot PRs, commits by dependabot[bot] (e.g. from @dependabot rebase) count as activity.
        is_human_or_dep = (
            c_author not in BOT_USERS or (pr_author in DEPENDABOT_USERS and c_author in DEPENDABOT_USERS)
        )
        if committed_date and is_human_or_dep:
            dt = parse_iso(committed_date)
            if dt is not None:
                dates.append(("commit", dt))

    # Filter comments to exclude automated bot accounts
    comments = get_nested(pr, "comments", "nodes", default=[])
    for c in reversed(comments):
        c_author = get_nested(c, "author", "login")
        c_typename = get_nested(c, "author", "__typename")
        if c_author not in BOT_USERS and c_typename != "Bot" and c.get("createdAt"):
            dt = parse_iso(c["createdAt"])
            if dt is not None:
                dates.append(("comment", dt))
                break

    # Filter reviews to exclude bot accounts and skip pending reviews (submittedAt is null)
    reviews = get_nested(pr, "reviews", "nodes", default=[])
    for r in reversed(reviews):
        r_author = get_nested(r, "author", "login")
        r_typename = get_nested(r, "author", "__typename")
        review_submitted_at = r.get("submittedAt")
        if r_author not in BOT_USERS and r_typename != "Bot" and review_submitted_at:
            dt = parse_iso(review_submitted_at)
            if dt is not None:
                dates.append(("review", dt))
                break

    # Track explicit maintainer interactions (reopened or manual label removal)
    timeline_nodes = get_nested(pr, "timelineItems", "nodes", default=[])
    for item in reversed(timeline_nodes):
        tname = item.get("__typename")
        if tname == "ReopenedEvent":
            dt = parse_iso(item.get("createdAt"))
            if dt is not None:
                dates.append(("reopened", dt))
                break
        elif tname == "UnlabeledEvent" and get_nested(item, "label", "name") == INACTIVE_LABEL:
            dt = parse_iso(item.get("createdAt"))
            if dt is not None:
                dates.append(("unlabeled", dt))
                break

    # Note: We intentionally omit updatedAt because background CI checks,
    # label mutations, and issue cross-references bump updatedAt without contributor activity.

    dates.sort(key=lambda x: x[1], reverse=True)
    fallback_dt = parse_iso(pr.get("createdAt")) or datetime.now(timezone.utc)
    return dates[0] if dates else ("created", fallback_dt)


def is_protected_pr(pr: Dict[str, Any]) -> Tuple[bool, str]:
    # Explicit exempt labels (e.g. DO NOT MERGE, ongoing, pinned)
    label_nodes = get_nested(pr, "labels", "nodes", default=[])
    labels = {l.get("name") for l in label_nodes if isinstance(l, dict) and l.get("name")}
    intersect = labels.intersection(EXEMPT_LABELS)
    if intersect:
        return True, f"Carries exempt label: {', '.join(sorted(intersect))}"

    return False, ""


def process_existing_inactive_prs(
    owner: str,
    repo: str,
    all_prs: List[Dict[str, Any]],
    grace_days: float,
    close_limit: int,
    dry_run: bool,
) -> Tuple[int, int]:
    """Evaluates PRs that already have the inactive label. Returns (closed_count, error_count)."""
    print("\n--- PHASE 1: Processing PRs currently labeled 'inactive' ---")
    labeled_prs = [
        p for p in all_prs
        if any(l.get("name") == INACTIVE_LABEL for l in get_nested(p, "labels", "nodes", default=[]))
    ]

    print(f"Discovered {len(labeled_prs)} open PRs currently carrying the '{INACTIVE_LABEL}' label.")
    if not labeled_prs:
        return 0, 0

    now = datetime.now(timezone.utc)
    closed_count = 0
    error_count = 0

    for pr in labeled_prs:
        if close_limit > 0 and closed_count >= close_limit:
            print(f"Reached close limit of {close_limit} PRs. Stopping Phase 1.")
            break

        pr_num = pr["number"]
        author = get_nested(pr, "author", "login", default="ghost")

        # Check if PR is protected by exempt labels
        protected, reason = is_protected_pr(pr)
        if protected:
            print(f"  #{pr_num} by @{author}: Protected ({reason}). Removing '{INACTIVE_LABEL}' label and skipping closure.")
            if dry_run:
                print(f"    [DRY-RUN] Would remove '{INACTIVE_LABEL}' label from protected PR #{pr_num}.")
            else:
                res = subprocess.run(
                    ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--remove-label", INACTIVE_LABEL],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res.returncode != 0:
                    print(f"    Failed to remove label from protected #{pr_num}: {res.stderr.strip()}", file=sys.stderr)
                    error_count += 1
            continue

        try:
            timeline_res = run_gh_graphql(TIMELINE_QUERY, {"owner": owner, "repo": repo, "number": pr_num})
            nodes = get_nested(timeline_res, "data", "repository", "pullRequest", "timelineItems", "nodes", default=[])
        except Exception as e:
            print(f"  Error fetching timeline for #{pr_num}: {e}", file=sys.stderr)
            error_count += 1
            continue

        # Find latest LabeledEvent for 'inactive'
        label_events = [
            n for n in nodes
            if n.get("__typename") == "LabeledEvent" and get_nested(n, "label", "name") == INACTIVE_LABEL
        ]

        if not label_events:
            print(f"  #{pr_num}: '{INACTIVE_LABEL}' label event not found in recent timeline. Skipping.")
            continue

        latest_label_dt = parse_iso(label_events[-1].get("createdAt"))
        if not latest_label_dt:
            continue

        days_labeled = (now - latest_label_dt).total_seconds() / 86400.0

        # Check for activity after labeling
        new_activity: List[Tuple[str, str, datetime]] = []
        for n in nodes:
            tname = n.get("__typename")
            if tname == "IssueComment":
                c_dt = parse_iso(n.get("createdAt"))
                user = get_nested(n, "author", "login", default="")
                user_type = get_nested(n, "author", "__typename")
                if c_dt and c_dt > latest_label_dt and user not in BOT_USERS and user_type != "Bot":
                    new_activity.append(("comment", user, c_dt))
            elif tname == "PullRequestCommit":
                c_dt = parse_iso(get_nested(n, "commit", "committedDate"))
                if c_dt and c_dt > latest_label_dt:
                    committer = get_nested(n, "commit", "author", "user", "login", default="")
                    is_human_or_dep = (
                        committer not in BOT_USERS or (author in DEPENDABOT_USERS and committer in DEPENDABOT_USERS)
                    )
                    if is_human_or_dep:
                        new_activity.append(("commit", committer, c_dt))
            elif tname == "ReopenedEvent":
                r_dt = parse_iso(n.get("createdAt"))
                if r_dt and r_dt > latest_label_dt:
                    new_activity.append(("reopened", "maintainer", r_dt))

        if new_activity:
            print(f"  #{pr_num} by @{author}: New activity detected after labeling ({len(new_activity)} events).")
            if dry_run:
                print(f"    [DRY-RUN] Would remove '{INACTIVE_LABEL}' label and post activity comment.")
            else:
                print(f"    Removing '{INACTIVE_LABEL}' label from #{pr_num}...")
                res = subprocess.run(
                    ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--remove-label", INACTIVE_LABEL],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res.returncode != 0:
                    print(f"    Failed to remove label from #{pr_num}: {res.stderr.strip()}", file=sys.stderr)
                    error_count += 1
                    continue

                msg = ACTIVITY_DETECTED_COMMENT.format(label=INACTIVE_LABEL)
                res_comment = subprocess.run(
                    ["gh", "pr", "comment", str(pr_num), "--repo", f"{owner}/{repo}", "--body", msg],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res_comment.returncode != 0:
                    print(f"    Failed to post activity comment on #{pr_num}: {res_comment.stderr.strip()}", file=sys.stderr)
                    error_count += 1
            continue

        if days_labeled >= grace_days:
            print(f"  #{pr_num} by @{author}: Labeled {days_labeled:.1f} days ago (>= {grace_days}d). Closing.")
            if dry_run:
                print(f"    [DRY-RUN] Would remove '{INACTIVE_LABEL}' label and close #{pr_num} with {grace_days}-day grace expiration comment.")
                closed_count += 1
            else:
                # Remove inactive label before closing so reopened PR does not retain the label
                res_unlabel = subprocess.run(
                    ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--remove-label", INACTIVE_LABEL],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res_unlabel.returncode != 0:
                    print(f"    Warning: Failed to remove '{INACTIVE_LABEL}' label from #{pr_num} prior to closing: {res_unlabel.stderr.strip()}", file=sys.stderr)
                    error_count += 1

                close_msg = CLOSURE_COMMENT.format(grace_days=int(grace_days), label=INACTIVE_LABEL)
                res = subprocess.run(
                    ["gh", "pr", "close", str(pr_num), "--repo", f"{owner}/{repo}", "--comment", close_msg],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if res.returncode != 0:
                    print(f"    Failed to close #{pr_num}: {res.stderr.strip()}", file=sys.stderr)
                    error_count += 1
                    continue
                closed_count += 1
        else:
            remaining = grace_days - days_labeled
            print(f"  #{pr_num} by @{author}: Labeled {days_labeled:.1f}d ago. In grace period ({remaining:.1f}d remaining).")

        time.sleep(0.3)

    return closed_count, error_count


def tag_new_inactive_prs(
    owner: str,
    repo: str,
    all_prs: List[Dict[str, Any]],
    inactive_days: float,
    grace_days: float,
    tag_limit: int,
    dry_run: bool,
) -> Tuple[int, int]:
    """Discovers and tags PRs that have been inactive for >= inactive_days. Returns (tagged_count, error_count)."""
    print(f"\n--- PHASE 2: Tagging new PRs inactive for >= {inactive_days} days ---")
    now = datetime.now(timezone.utc)
    candidates: List[Tuple[Dict[str, Any], float]] = []

    for pr in all_prs:
        # Skip PRs that already have the inactive label
        if any(l.get("name") == INACTIVE_LABEL for l in get_nested(pr, "labels", "nodes", default=[])):
            continue

        protected, reason = is_protected_pr(pr)
        if protected:
            continue

        _, last_dt = get_last_activity(pr)
        days_inactive = (now - last_dt).total_seconds() / 86400.0

        if days_inactive >= inactive_days:
            candidates.append((pr, days_inactive))

    # Sort oldest-inactive first
    candidates.sort(key=lambda x: x[1], reverse=True)
    total_candidates = len(candidates)
    print(f"Discovered {total_candidates} candidates inactive for >= {inactive_days} days.")

    if tag_limit > 0:
        candidates = candidates[:tag_limit]
        print(f"Selected top {len(candidates)} oldest candidates for tagging (limit: {tag_limit}).")

    if not candidates:
        return 0, 0

    tagged_count = 0
    error_count = 0
    for pr, days_inactive in candidates:
        pr_num = pr["number"]
        author = get_nested(pr, "author", "login", default="ghost")
        is_dependabot = author in DEPENDABOT_USERS
        title = pr.get("title", "")

        print(f"  #{pr_num} by @{author} ({int(days_inactive)}d inactive): {title[:60]}")

        if dry_run:
            print(f"    [DRY-RUN] Would post warning comment and add '{INACTIVE_LABEL}' label.")
            tagged_count += 1
            continue

        # Prepare comment
        if is_dependabot:
            comment_body = DEPENDABOT_WARNING_COMMENT.format(
                label=INACTIVE_LABEL,
                days_inactive=int(days_inactive),
                grace_days=int(grace_days),
            )
        else:
            greeting = f"Hello @{author}! 👋" if author and author != "ghost" else "Hello! 👋"
            comment_body = TAG_WARNING_COMMENT.format(
                greeting=greeting,
                label=INACTIVE_LABEL,
                days_inactive=int(days_inactive),
                grace_days=int(grace_days),
            )

        # Post comment first to eliminate partial mutation hazard
        res_com = subprocess.run(
            ["gh", "pr", "comment", str(pr_num), "--repo", f"{owner}/{repo}", "--body", comment_body],
            capture_output=True,
            text=True,
            check=False,
        )
        if res_com.returncode != 0:
            print(f"    Failed to comment on #{pr_num}: {res_com.stderr.strip()}. Skipping label application.", file=sys.stderr)
            error_count += 1
            continue

        # Add label only after commenting succeeds
        res_lbl = subprocess.run(
            ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--add-label", INACTIVE_LABEL],
            capture_output=True,
            text=True,
            check=False,
        )
        if res_lbl.returncode != 0:
            print(f"    Failed to add label to #{pr_num}: {res_lbl.stderr.strip()}", file=sys.stderr)
            error_count += 1
            continue

        tagged_count += 1
        time.sleep(0.8)  # Politeness interval

    return tagged_count, error_count


def main() -> None:
    env_dry_run = os.environ.get("INPUT_DRY_RUN", "").lower() == "true"
    env_inactive_days = (
        float(os.environ["INPUT_INACTIVE_DAYS"])
        if os.environ.get("INPUT_INACTIVE_DAYS")
        else DEFAULT_INACTIVE_DAYS
    )
    env_grace_days = (
        float(os.environ["INPUT_GRACE_DAYS"])
        if os.environ.get("INPUT_GRACE_DAYS")
        else DEFAULT_GRACE_DAYS
    )
    env_tag_limit = (
        int(os.environ["INPUT_TAG_LIMIT"])
        if os.environ.get("INPUT_TAG_LIMIT")
        else DEFAULT_TAG_LIMIT
    )

    parser = argparse.ArgumentParser(description="Manage inactive PR lifecycle on firebase-tools.")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO), help="GitHub repo (owner/repo).")
    parser.add_argument("--inactive-days", type=float, default=env_inactive_days, help=f"Inactivity threshold in days (default: {env_inactive_days}).")
    parser.add_argument("--grace-days", type=float, default=env_grace_days, help=f"Grace period before closing tagged PRs (default: {env_grace_days}).")
    parser.add_argument("--tag-limit", type=int, default=env_tag_limit, help=f"Max PRs to tag per run (default: {env_tag_limit}, 0 for unlimited).")
    parser.add_argument("--close-limit", type=int, default=DEFAULT_CLOSE_LIMIT, help="Max PRs to close per run (default: 50, 0 for unlimited).")
    parser.add_argument("--dry-run", action="store_true", default=env_dry_run, help="Preview actions without modifying GitHub.")
    args = parser.parse_args()

    # Input bounds validation
    if "/" not in args.repo:
        print(f"Error: Invalid repository format '{args.repo}'. Expected 'owner/repo'.", file=sys.stderr)
        sys.exit(1)
    if args.inactive_days <= 0:
        print(f"Error: Inactivity threshold must be greater than 0 (got {args.inactive_days}).", file=sys.stderr)
        sys.exit(1)
    if args.grace_days <= 0:
        print(f"Error: Grace period must be greater than 0 (got {args.grace_days}).", file=sys.stderr)
        sys.exit(1)

    owner, repo = args.repo.split("/", 1)
    mode_str = "DRY RUN (no mutations)" if args.dry_run else "LIVE MUTATION"
    print(f"=== Firebase Tools Inactive PR Cleanup ===")
    print(f"Target Repository : {owner}/{repo}")
    print(f"Inactivity Window : >= {args.inactive_days} days")
    print(f"Grace Period      : {args.grace_days} days")
    print(f"Batch Tag Limit   : {args.tag_limit}")
    print(f"Execution Mode    : {mode_str}\n")

    print(f"Scanning all open PRs in {owner}/{repo}...")
    all_prs = fetch_all_open_prs(owner, repo)
    print(f"Successfully retrieved {len(all_prs)} open pull requests.")

    closed_count, phase1_errors = process_existing_inactive_prs(
        owner=owner,
        repo=repo,
        all_prs=all_prs,
        grace_days=args.grace_days,
        close_limit=args.close_limit,
        dry_run=args.dry_run,
    )

    tagged_count, phase2_errors = tag_new_inactive_prs(
        owner=owner,
        repo=repo,
        all_prs=all_prs,
        inactive_days=args.inactive_days,
        grace_days=args.grace_days,
        tag_limit=args.tag_limit,
        dry_run=args.dry_run,
    )

    total_errors = phase1_errors + phase2_errors

    print("\n=== Cleanup Summary ===")
    print(f"PRs Closed (Grace Expired) : {closed_count}")
    print(f"PRs Tagged (>= {args.inactive_days}d Inactive) : {tagged_count}")
    print(f"Errors Encountered         : {total_errors}")
    print("Execution complete.\n")

    if total_errors > 0:
        print(f"Encountered {total_errors} error(s) during execution.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
