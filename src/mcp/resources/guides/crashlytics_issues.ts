import { resource } from "../../resource";

export const crashlytics_issues = resource(
  {
    uri: "firebase://guides/crashlytics/issues",
    name: "crashlytics_issues_guide",
    title: "Firebase Crashlytics Issues Guide",
    description:
      "guides the coding agent when working with Crashlytics issues, including prioritization rules and procedures for diagnosing and fixing crashes",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### How to Prioritize Crashlytics Issues

Follow these steps to fetch issues and prioritize them.

  1. Use the 'crashlytics_get_top_issues' tool to fetch up to 20 issues.
    1a. Analyze the user's query and apply the appropriate filters.
    1b. If the user asks for crashes, then set the issueErrorType filter to *FATAL*.
    1c. If the user asks about a particular time range, then set both the intervalStartTime and intervalEndTime.
  2. Use the 'crashlytics_get_top_versions' tool to fetch the top versions for this app.
  3. If the user instructions include statements about prioritization, use those instructions.
  4. If the user instructions do not include statements about prioritization, then prioritize the returned issues using the following criteria:
    4a. The app versions for the issue include the most recent version of the app.
    4b. The number of users experiencing the issue across variants
    4c. The volume of crashes
  5. Return the top 5 issues, with a brief description each in a numerical list with the following format: 
    1. Issue <issue id>
        * <the issue title>
        * <the issue subtitle>
        * **Description:** <a discription of the issue based on information from the tool response>
        * **Rationale:** <the reason this issue was prioritized in the way it was>
  6. Ask the user if they would like to diagnose and fix any of the issues presented
`.trim(),
        },
      ],
    };
  },
);
