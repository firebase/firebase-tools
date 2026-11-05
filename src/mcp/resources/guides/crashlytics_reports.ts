import { resource } from "../../resource";

const RESOURCE_CONTENT = `
### Crashlytics Reports

Aggregate metrics for all of the events sent to Crashlytics are available as reports.

### Useful Reports

  * The "appSummary" report provides overall app health metrics, including crash-free users and crash-free sessions percentages. 
    Combine it with \`granularity\` (such as \`TIME_GRANULARITY_DAY\` or \`TIME_GRANULARITY_HOUR\`) to analyze stability trends over time.
  
  * The "releaseVersions" report groups metrics by the latest semantic release versions, making it ideal for comparing adoption and crash-free rates across recent releases.
  
  * The "topIssues" report is comparable to the default view on the Crashlytics web dashboard. 
    Use this report to prioritize which issues are impacting the most users.
    Apply appropriate filters for time interval based on the user's query. 
    Report responses grouped by issue will include a sample event URI. 
    Use the "crashlytics_batch_get_events" tool to fetch the complete record for any sample event.
    When investigating an issue, use the appropriate top devices and top operating systems reports to understand what systems are impacted by the problem. 
    Pass the "issueId" in the filter to narrow any report to a specific issue.

Agents can retrieve a full list of available reports by passing an empty report name.

Report responses contain the following metrics:

  - eventsCount: the number of events matching
  - impactedUsersCount: the number of distinct end users in all the matching events
  - impactedSessionsCount: the number of distinct sessions in all the matching events
  - totalUsersCount: the total number of distinct active users
  - totalSessionsCount: the total number of distinct active sessions
  - crashFreeUsersPercentage: percentage of crash-free users (mobile only)
  - crashFreeSessionsPercentage: percentage of crash-free sessions (mobile only)

Report responses are grouped by one of the following dimensions (or cover the entire app for \`appSummary\`):

  - app version
  - issue
  - variant
  - operating system
  - mobile device type (mobile only)
  - browser (web only)
  - error type (web only)

### Time Granularity

The \`granularity\` parameter controls how metrics are bucketed over the requested time interval:

  * \`TIME_GRANULARITY_NONE\`: Returns a single aggregated interval covering the entire requested time range (default when \`granularity\` is omitted).
  * \`TIME_GRANULARITY_HOUR\`: Returns one metrics entry per hour across the requested time range.
  * \`TIME_GRANULARITY_DAY\`: Returns one metrics entry per day across the requested time range.

### Filters

When setting report filters adhere to the following instructions.

  * Issue Filtering:
    * For mobile apps, use the \`issueErrorTypes\` field to focus on events of different fatalities:
      * FATAL: native crashes, which caused the app to exit.
      * NON_FATAL: uncaught or manually reported exceptions, which did not crash the app.
      * ANR: "app not responding" events, only relevant on Android platforms.

  * Time Interval:
    * For a custom time range, you must specify both intervalStartTime and intervalEndTime.
    * The specified time range must be within the last 90 days.
    * If you don't provide a time range, it will default to the last 7 days.

  * Display Names (for app versions, operating systems, and devices):
    * The values for versionDisplayNames,operatingSystemDisplayNames, and deviceDisplayNames must be obtained from the displayName field of a previous API response.
    * These display names must match specific formats:
      * Device: 'manufacturer (device)'
      * Operating System: 'os (version)'
      * App Version: 'version (build)'

### How to Display Issues

When displaying a list of issues, use the following format:

  1. Issue <full issue id>
    * <the issue title>
    * <the issue subtitle>
    * **Description:** <a discription of the issue based on information from the tool response>
`.trim();

export const crashlytics_reports = resource(
  {
    uri: "firebase://guides/crashlytics/reports",
    name: "crashlytics_reports_guide",
    title: "Firebase Crashlytics Reports Guide",
    description:
      "Guides the coding agent through requesting Crashlytics reports, including setting appropriate filters and how to understand the metrics. The agent should read this guide before requesting any report.",
  },
  async (uri) => {
    return {
      contents: [{ uri, type: "text", text: RESOURCE_CONTENT }],
    };
  },
);
