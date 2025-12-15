import { resource } from "../../resource";

const RESOURCE_CONTENT = `
### Crashlytics Reports

Aggregate metrics for all of the events sent to Crashlytics are available as reports. 
The following reports are available for all Crashlytics applications.

  - name: "topIssues"
    display_name: "Top Issues"
    usage: |
      Counts events and distinct impacted users, grouped by issue.
      Issue groups are sorted by event count, in descending order.

  - name: "topVariants"
    display_name: "Top Variants"
    usage: |
      Counts events and distinct impacted users, grouped by issue variant.
      Issue variant groups are sorted by event count, in descending order.
    required: |
      An issue filter including an issue id is required.
  
  - name: "topVersions"
    display_name: "Top Versions"
    usage: |
      Counts events, grouped by app version.
      Versions are sorted by event count, in descending order.

  - name: "topOperatingSystems"
    display_name: "Top Operating Systems"
    usage: |
      Counts events, grouped by device operating systems and their versions.
      Operating systems are sorted by event count, in descending order.

Mobile apps have one of the following reports available, depending on the platform. 

  - name: "topAndroidDevices"
    display_name: "Top Android Devices"
    usage: |
      Counts events, grouped by android device.
      Devices are sorted by event count, in descending order.

  - name: "topAppleDevices"
    display_name: "Top Apple Devices"
    usage:
      Counts events, grouped by operating system and Apple device.
      Devices are sorted by event count, in descending order.

Report responses contain the following metrics:

  - eventsCount: the number of events matching
  - impactedUsers: the number of distinct end users in all the matching events

Report responses are always grouped by one of the following dimensions:

  - app version
  - issue
  - variant
  - operating system
  - mobile device type

### Filters

When setting report filters adhere to the following instructions.

  * Issue Filtering:
    * Use the \`issueErrorTypes\` field to focus on events of different fatalities: 
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

### Useful Reports

  * The "topIssues" report is comparable to the default view on the Crashlytics web dashboard. Use this report first to prioritize which issues are impacting the most users. Apply appropriate filters for time interval based on the user's query.

  * Report responses grouped by issue will include a sample event URI. Use the "crashlytics_batch_get_events" tool to fetch the complete record for any sample event.
  
  * When investigating an issue, use the appropriate top devices and top operating systems reports to understand what systems are impacted by the problem. Pass the "issueId" in the filter to narrow any report to a specific issue.
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
