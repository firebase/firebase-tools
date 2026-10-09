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

# Labels that protect a PR from being marked inactive
EXEMPT_LABELS = {
    "DO NOT MERGE",
    "ongoing",
    "pinned",
}

PRS_QUERY = """
query($cursor: String) {
  repository(owner: "{owner}", name: "{repo}") {
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
        updatedAt
        isDraft
        headRefName
        author {
          login
        }
        labels(first: 20) {
          nodes {
            name
          }
        }
        comments(last: 5) {
          totalCount
          nodes {
            createdAt
            author {
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
              login
            }
            state
          }
        }
      }
    }
  }
}
"""

TIMELINE_QUERY = """
query($number: Int!) {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: $number) {
      number
      title
      url
      author {
        login
      }
      timelineItems(itemTypes: [LABELED_EVENT, ISSUE_COMMENT, PULL_REQUEST_COMMIT], last: 40) {
        nodes {
          __typename
          ... on LabeledEvent {
            createdAt
            label {
              name
            }
          }
          ... on IssueComment {
            createdAt
            author {
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

TAG_WARNING_COMMENT = """Hello @{author}! 👋

Thank you for your contribution to `firebase-tools`. Because there has been no recent activity on this pull request for over {days_inactive} days, we are marking it as `{label}`.

**What happens next?**
- If you would like to keep this PR open, please leave a comment or push an update within the next **{grace_days} days**, and the `{label}` label will be automatically removed.
- If we do not hear from you within {grace_days} days, this PR will be automatically closed to keep our backlog manageable.

If you need more time or have questions, just let us know. You are always welcome to reopen or submit a fresh pull request in the future. Thank you!"""

DEPENDABOT_WARNING_COMMENT = """Marking this Dependabot pull request as `{label}` due to {days_inactive} days of inactivity. This PR will be automatically closed in {grace_days} days if not merged or updated."""

CLOSURE_COMMENT = """Closing this pull request after {grace_days} days of inactivity following the `{label}` notification.

Thank you for contributing to `firebase-tools`! If you would like to revisit this change or continue work, please rebase against the latest `main` branch and feel free to reopen or open a new pull request. We appreciate your time!"""

ACTIVITY_DETECTED_COMMENT = """Activity detected on this pull request! Removing the `{label}` label. Thank you for your continued contribution!"""


def parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    return datetime.fromisoformat(dt_str)


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
    return json.loads(res.stdout)


def fetch_all_open_prs(owner: str, repo: str) -> List[Dict[str, Any]]:
    query_template = PRS_QUERY.replace("{owner}", owner).replace("{repo}", repo)
    cursor = None
    all_prs: List[Dict[str, Any]] = []

    page = 1
    while True:
        vars_dict = {"cursor": cursor} if cursor else None
        data = run_gh_graphql(query_template, vars_dict)
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

    if pr.get("createdAt"):
        dates.append(("created", parse_iso(pr["createdAt"])))  # type: ignore

    commits = pr.get("commits", {}).get("nodes", [])
    if commits and commits[0].get("commit", {}).get("committedDate"):
        dates.append(("commit", parse_iso(commits[0]["commit"]["committedDate"])))  # type: ignore

    comments = pr.get("comments", {}).get("nodes", [])
    if comments and comments[-1].get("createdAt"):
        dates.append(("comment", parse_iso(comments[-1]["createdAt"])))  # type: ignore

    reviews = pr.get("reviews", {}).get("nodes", [])
    if reviews and reviews[-1].get("submittedAt"):
        dates.append(("review", parse_iso(reviews[-1]["submittedAt"])))  # type: ignore

    if pr.get("updatedAt"):
        dates.append(("updated", parse_iso(pr["updatedAt"])))  # type: ignore

    dates.sort(key=lambda x: x[1], reverse=True)
    return dates[0] if dates else ("created", parse_iso(pr.get("createdAt")))  # type: ignore


def is_protected_pr(pr: Dict[str, Any]) -> Tuple[bool, str]:
    head = pr.get("headRefName", "") or ""
    title = pr.get("title", "") or ""
    author = pr.get("author", {}).get("login", "") if pr.get("author") else ""

    # 1. Autonomous AI improvement tasks (Buganizer component 2268168)
    if head.startswith("ai-improve-") or "[AI Improvement]" in title or (author == "joehan" and "[Task]" in title):
        return True, "Active AI Improvement task (Buganizer component 2268168)"

    # 2. Explicit exempt labels
    labels = {l["name"] for l in pr.get("labels", {}).get("nodes", [])}
    intersect = labels.intersection(EXEMPT_LABELS)
    if intersect:
        return True, f"Carries exempt label: {', '.join(intersect)}"

    return False, ""


def process_existing_inactive_prs(
    owner: str,
    repo: str,
    all_prs: List[Dict[str, Any]],
    grace_days: float,
    close_limit: int,
    dry_run: bool,
) -> int:
    """Evaluates PRs that already have the inactive label."""
    print("\n--- PHASE 1: Processing PRs currently labeled 'inactive' ---")
    labeled_prs = [
        p for p in all_prs
        if any(l["name"] == INACTIVE_LABEL for l in p.get("labels", {}).get("nodes", []))
    ]

    print(f"Discovered {len(labeled_prs)} open PRs currently carrying the '{INACTIVE_LABEL}' label.")
    if not labeled_prs:
        return 0

    now = datetime.now(timezone.utc)
    timeline_template = TIMELINE_QUERY.replace("{owner}", owner).replace("{repo}", repo)
    closed_count = 0

    for pr in labeled_prs:
        if close_limit > 0 and closed_count >= close_limit:
            print(f"Reached close limit of {close_limit} PRs. Stopping Phase 1.")
            break

        pr_num = pr["number"]
        author = pr["author"]["login"] if pr.get("author") else "ghost"

        try:
            timeline_res = run_gh_graphql(timeline_template, {"number": pr_num})
            nodes = timeline_res["data"]["repository"]["pullRequest"]["timelineItems"]["nodes"]
        except Exception as e:
            print(f"  Error fetching timeline for #{pr_num}: {e}", file=sys.stderr)
            continue

        # Find latest LabeledEvent for 'inactive'
        label_events = [
            n for n in nodes
            if n["__typename"] == "LabeledEvent" and n.get("label", {}).get("name") == INACTIVE_LABEL
        ]

        if not label_events:
            print(f"  #{pr_num}: '{INACTIVE_LABEL}' label event not found in recent timeline. Skipping.")
            continue

        latest_label_dt = parse_iso(label_events[-1]["createdAt"])
        if not latest_label_dt:
            continue

        days_labeled = (now - latest_label_dt).total_seconds() / 86400.0

        # Check for activity after labeling
        new_activity: List[Tuple[str, str, datetime]] = []
        for n in nodes:
            tname = n["__typename"]
            if tname == "IssueComment":
                c_dt = parse_iso(n["createdAt"])
                user = n.get("author", {}).get("login", "")
                if c_dt and c_dt > latest_label_dt and user not in BOT_USERS:
                    new_activity.append(("comment", user, c_dt))
            elif tname == "PullRequestCommit":
                c_dt = parse_iso(n.get("commit", {}).get("committedDate"))
                if c_dt and c_dt > latest_label_dt:
                    committer = n.get("commit", {}).get("author", {}).get("user", {}).get("login", "")
                    new_activity.append(("commit", committer, c_dt))

        if new_activity:
            print(f"  #{pr_num} by @{author}: New activity detected after labeling ({len(new_activity)} events).")
            if dry_run:
                print(f"    [DRY-RUN] Would remove '{INACTIVE_LABEL}' label and post activity comment.")
            else:
                print(f"    Removing '{INACTIVE_LABEL}' label from #{pr_num}...")
                subprocess.run(
                    ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--remove-label", INACTIVE_LABEL],
                    check=False,
                )
                msg = ACTIVITY_DETECTED_COMMENT.format(label=INACTIVE_LABEL)
                subprocess.run(
                    ["gh", "pr", "comment", str(pr_num), "--repo", f"{owner}/{repo}", "--body", msg],
                    check=False,
                )
            continue

        if days_labeled >= grace_days:
            print(f"  #{pr_num} by @{author}: Labeled {days_labeled:.1f} days ago (>= {grace_days}d). Closing.")
            if dry_run:
                print(f"    [DRY-RUN] Would close #{pr_num} with 5-day grace expiration comment.")
            else:
                close_msg = CLOSURE_COMMENT.format(grace_days=int(grace_days), label=INACTIVE_LABEL)
                subprocess.run(
                    ["gh", "pr", "close", str(pr_num), "--repo", f"{owner}/{repo}", "--comment", close_msg],
                    check=False,
                )
            closed_count += 1
        else:
            remaining = grace_days - days_labeled
            print(f"  #{pr_num} by @{author}: Labeled {days_labeled:.1f}d ago. In grace period ({remaining:.1f}d remaining).")

        time.sleep(0.3)

    return closed_count


def tag_new_inactive_prs(
    owner: str,
    repo: str,
    all_prs: List[Dict[str, Any]],
    inactive_days: float,
    grace_days: float,
    tag_limit: int,
    dry_run: bool,
) -> int:
    """Discovers and tags PRs that have been inactive for >= inactive_days."""
    print(f"\n--- PHASE 2: Tagging new PRs inactive for >= {inactive_days} days ---")
    now = datetime.now(timezone.utc)
    candidates: List[Tuple[Dict[str, Any], float]] = []

    for pr in all_prs:
        # Skip PRs that already have the inactive label
        if any(l["name"] == INACTIVE_LABEL for l in pr.get("labels", {}).get("nodes", [])):
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
        return 0

    tagged_count = 0
    for pr, days_inactive in candidates:
        pr_num = pr["number"]
        author = pr["author"]["login"] if pr.get("author") else "ghost"
        is_dependabot = author in ["dependabot", "dependabot[bot]", "app/dependabot"]
        title = pr.get("title", "")

        print(f"  #{pr_num} by @{author} ({int(days_inactive)}d inactive): {title[:60]}")

        if dry_run:
            print(f"    [DRY-RUN] Would add '{INACTIVE_LABEL}' label and post warning comment.")
            tagged_count += 1
            continue

        # Add label
        res = subprocess.run(
            ["gh", "pr", "edit", str(pr_num), "--repo", f"{owner}/{repo}", "--add-label", INACTIVE_LABEL],
            capture_output=True,
            text=True,
            check=False,
        )
        if res.returncode != 0:
            print(f"    Failed to add label to #{pr_num}: {res.stderr.strip()}", file=sys.stderr)
            continue

        # Post comment
        if is_dependabot:
            comment_body = DEPENDABOT_WARNING_COMMENT.format(
                label=INACTIVE_LABEL,
                days_inactive=int(days_inactive),
                grace_days=int(grace_days),
            )
        else:
            comment_body = TAG_WARNING_COMMENT.format(
                author=author,
                label=INACTIVE_LABEL,
                days_inactive=int(days_inactive),
                grace_days=int(grace_days),
            )

        subprocess.run(
            ["gh", "pr", "comment", str(pr_num), "--repo", f"{owner}/{repo}", "--body", comment_body],
            capture_output=True,
            text=True,
            check=False,
        )

        tagged_count += 1
        time.sleep(0.8)  # Politeness interval

    return tagged_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage inactive PR lifecycle on firebase-tools.")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", DEFAULT_REPO), help="GitHub repo (owner/repo).")
    parser.add_argument("--inactive-days", type=float, default=DEFAULT_INACTIVE_DAYS, help="Inactivity threshold in days (default: 60).")
    parser.add_argument("--grace-days", type=float, default=DEFAULT_GRACE_DAYS, help="Grace period before closing tagged PRs (default: 5).")
    parser.add_argument("--tag-limit", type=int, default=DEFAULT_TAG_LIMIT, help="Max PRs to tag per run (default: 30, 0 for unlimited).")
    parser.add_argument("--close-limit", type=int, default=DEFAULT_CLOSE_LIMIT, help="Max PRs to close per run (default: 50, 0 for unlimited).")
    parser.add_argument("--dry-run", action="store_true", help="Preview actions without modifying GitHub.")
    args = parser.parse_args()

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

    closed_count = process_existing_inactive_prs(
        owner=owner,
        repo=repo,
        all_prs=all_prs,
        grace_days=args.grace_days,
        close_limit=args.close_limit,
        dry_run=args.dry_run,
    )

    tagged_count = tag_new_inactive_prs(
        owner=owner,
        repo=repo,
        all_prs=all_prs,
        inactive_days=args.inactive_days,
        grace_days=args.grace_days,
        tag_limit=args.tag_limit,
        dry_run=args.dry_run,
    )

    print("\n=== Cleanup Summary ===")
    print(f"PRs Closed (Grace Expired) : {closed_count}")
    print(f"PRs Tagged (>= {args.inactive_days}d Inactive) : {tagged_count}")
    print("Execution complete.\n")


if __name__ == "__main__":
    main()
