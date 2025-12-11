import { resource } from "../../resource";

export const RESOURCE_CONTENT = `
### Instructions for Working with Firebase Crashlytics Tools

Only ask the user one question at a time. Do not proceed without user instructions. Upon receiving user instructions, refer to the relevant resources for guidance.

Use the \`firebase_read_resources\` tool to access the following guides.

  1. [Firebase App Id Guide](firebase://guides/app_id)
     This guide provides crucial instructions for obtaining the application's App Id which is required for all API calls.

  2. [Firebase Crashlytics Reports Guide](firebase://guides/crashlytics/reports)
     This guide details how to request and use aggregated numerical data from Crashlytics. The agent should read this guide before requesting any report.
    
  3. [Firebase Crashlytics Issues Guide](firebase://guides/crashlytics/issues)
     This guide details how to work with issues within Crashlytics. The agent should read this guide before prioritizing issues or presenting issue data to the user.

  4. [Investigating Crashlytics Issues](firebase://guides/crashlytics/investigations)
     This guide provides instructions on investigating the root causes of crashes and exceptions reported in Crashlytics issues.

### Check That You Are Connected

Verify that you can read the app's Crashlytics data by getting the topVersions report. This report will tell you which app versions have the most events.
  a. Call the \`firebase_get_environment\` tool if you need to find the app_id.
  b. Call the \`crashlytics_get_report\` tool to read the \`topVersions\` report.
  c. If you haven't read the reports guide, then the tool will include it in the response. This is OK. Simply call the tool again.
  d. Help the user resolve any issues that arise when trying to connect.

After confirming you can access Crashlytics, inquire about the desired actions. Your capabilities include:

  - Reading Crashlytics reports.
  - Investigating bug reports using Crashlytics event data.
  - Proposing code changes to resolve identified bugs.
`.trim();

export const crashlytics_connect = resource(
  {
    uri: "firebase://guides/crashlytics/connect",
    name: "crashlytics_connect_guide",
    title: "Firebase Crashlytics Connect Guide",
    description: "Guides the coding agent to connect to Firebase Crashlytics.",
  },
  async (uri) => {
    return {
      contents: [{ uri, type: "text", text: RESOURCE_CONTENT }],
    };
  },
);
