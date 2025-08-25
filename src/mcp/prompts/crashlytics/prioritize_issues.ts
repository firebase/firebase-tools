import { prompt } from "../../prompt";
import { ACTIVE_USER_INSTRUCTION, getAppIdInstruction } from "./common";

const APP_ID_INSTRUCTION = getAppIdInstruction(2);

export const prioritize_issues = prompt(
  {
    name: "prioritize_issues",
    omitPrefix: false,
    description: "Fetch and prioritize issues from Crashlytics.",
    arguments: [
      {
        name: "app_id",
        description: "AppId for which the issues list should be fetched.",
        required: false,
      },
      {
        name: "issue_count",
        description:
          "The number of issues that should be returned in the final list. Defaults to 5.",
        required: false,
      },
      {
        name: "prompt",
        description: "Any additional instructions you wish to provide about issue prioritization.",
        required: false,
      },
    ],
    annotations: {
      title: "Prioritize Crashlytics Issues",
    },
  },
  async ({ app_id, prompt, issue_count }, { accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to prioritize issues from Crashlytics and return the top ${issue_count || 5} issues based on the criteria below.

Active user: ${accountEmail || "<NONE>"}
Active app: ${app_id || "<NONE>"}

## User Instructions

${prompt || "<the user didn't supply specific instructions>"}

## Required information

Before fetching and prioritizing issues, secure the following information:

First, and this is INCREDIBLY IMPORTANT, verify the active user. IT IS SO IMPORTANT THAT YOU DO THIS FIRST. NO TOOL CALL WILL WORK WITHOUT IT. ${ACTIVE_USER_INSTRUCTION}
Then, verify the app id. ${APP_ID_INSTRUCTION}

Both pieces of information are required to successfully prioritize issues.

## Steps

Follow the steps below taking note of any user instructions provided above.

1. Use the 'crashlytics_list_top_issues' tool to fetch up to 20 issues.
2. Use the 'crashlytics_list_top_versions' tool to fetch the top versions for this app.
3. If the user instructions include statements about prioritization, use those instructions.
4. If the user instructions do not include statements about prioritization, then prioritize the returned issues using the following criteria:
  4a. The app versions for the issue include the most recent version of the app.
  4b. The number of users experiencing the issue across variants
  4c. The volume of crashes
5. Return the top ${issue_count || 5} issue ids, with a brief description of the issue in the following format: 
   * Issue <issue id>
       * <the issue title>
       * <the issue subtitle>
       * Description: <a discription of the issue based on information from the tool response>
       * Rationale: <the reason this issue was prioritized in the way it was>

The point of this command is to surface information only.
`.trim(),
        },
      },
    ];
  },
);
