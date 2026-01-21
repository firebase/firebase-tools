# Understanding Crashlytics Issues

This guide details the structure and lifecycle of a Crashlytics "Issue". Understanding these concepts is critical for effectively prioritizing and communicating stability problems to the user.

## 1. The Anatomy of an Issue

In Crashlytics, similar crashes are grouped together into an **Issue**. This grouping is done automatically on the server side unless you encounter a unique scenario where custom grouping is required (rare).

### Key Components

*   **Issue ID (UUID):** A hexadecimal string (e.g., `5b34...`) that uniquely identifies the issue group.
*   **Title:** usually the Exception Type (e.g., `java.lang.NullPointerException` or `SIGSEGV`).
*   **Subtitle:** usually the top frame of the stack trace that is "blamed" for the crash (e.g., `com.example.app.MainActivity.onCreate`).
*   **Variant:** Different "flavors" of the same root cause. For example, the same crash might happen on two different lines or have slightly different stack traces but share the same root cause.

## 2. Issue Types (Fatalities)

Crashlytics categorizes issues into three primary bucket types. You can look for these in the `issueErrorTypes` filter.

1.  **FATAL (Crashes):** The app completely terminated. These are the highest severity as they disrupt the user experience entirely.
    *   *Examples:* Uncaught Kotlin/Java exceptions, Native (C++) crashes (SIGSEGV, SIGABRT).

2.  **NON_FATAL (Logged Errors):** The app caught an exception but decided to report it (using `FirebaseCrashlytics.getInstance().recordException(e)`). The user might have seen an error dialog or a silent failure, but the app remained open.

3.  **ANR (Application Not Responding):** The UI thread was blocked for too long (5+ seconds), and the OS prompted the user to close the app.
    *   *Note:* ANRs are particularly damaging to Google Play Store rankings (`bad behavior threshold`).

## 3. Issue Signals

Crashlytics assigns "Signals" to help with triage.

*   **EARLY:** The first time this crash has been seen in a *new* version of the app. Useful for spotting regressions in a staged rollout.
*   **FRESH:** A completely new crash that has never been seen before in *any* version.
*   **REGRESSED:** A crash that was previously marked "Closed" but has reappeared in a new app version. This indicates a failed fix or a re-introduction of the bug.
*   **REPETITIVE:** A crash that is happening frequently to a single user.

## 4. Prioritization Strategy

When presenting issues to a user or deciding what to fix, use this hierarchy:

1.  **Impacted Users (Reach):** Always prioritize issues affecting the *highest number of distinct users* over raw event counts. A crash hitting 1,000 users once is worse than a crash hitting 1 user 1,000 times.
2.  **Velocity:** Issues that are spiking recently (e.g., "Velocity Alert") take precedence.
3.  **Severity:** FATAL/ANR > NON_FATAL.

## 5. Working with Issues

When using the `crashlytics_update_issue` tool:

*   **OPEN:** The default state. The issue is active and needs attention.
*   **CLOSED:** The issue has been fixed. If it occurs again in a *new* version, it will regress.
*   **MUTED:** The issue is known but "won't fix" or is noise. It will not alert you again unless you unmute it.
