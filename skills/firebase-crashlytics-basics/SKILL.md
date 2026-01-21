---
name: firebase-crashlytics-basics
description: Instrument mobile applications with Firebase Crashlytics, access crash reports and debug issues. Trigger when the user requests to instrument their mobile application or access crash reports.
---

This skill provides resources for integrating Firebase Crashlytics in Android applications and accessing crash reports.

### Adding Crashlytics to an Android Application

**[Add the Android SDK](references/android_sdk.md)**
This guide contains the instructions for adding the Firebase Crashlytics SDK to a Java or Kotlin project, including Gradle configuration and basic initialization.

### Instrumenting the Application

**[Codebase Documentation](references/codebase_documentation.md)**
A high-quality, technical reference doc for the codebase is an important prerequisite for adding effective instrumentation. If suitable documentation does not already exist, then follow this guide first to understand the codebase.

**[Instrument with Analytics](references/instrument_analytics.md)**
Crashlytics works in conjunction with Google Analytics for Firebase, such that many standard events are automatically instrumented. All users are encouraged to implement analytics along with Crashlytics. This guide describes how to add the analytics SDK and to record analytics events.

**[Instrument with Logging](references/instrument_logging.md)**
Crashlytics logs can be used to make crash reports more informative and actionable. This guide describes how to add effective logging to the application and distinguishes between strategies for apps with and without Firebase Analytics.

### Accessing Crashlytics Data with the Firebase MCP Server

To access crash reports, the agent must run the Firebase MCP server and the Crashlytics tools must be available.

**[Firebase Crashlytics Reports Guide](references/reports.md)**
This guide details how to request and use aggregated numerical data from Crashlytics. The agent should read this guide before requesting any report.

**[Firebase Crashlytics Issues Guide](references/issues.md)**
This guide details how to work with issues within Crashlytics. The agent should read this guide before prioritizing issues or presenting issue data to the user.

**[Investigating Crashlytics Issues Guide](references/investigations.md)**
This guide provides instructions on investigating the root causes of crashes and exceptions reported in Crashlytics issues.