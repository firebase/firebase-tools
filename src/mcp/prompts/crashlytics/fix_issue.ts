import { prompt } from "../../prompt";
import { ACTIVE_USER_INSTRUCTION, getAppIdInstruction } from "./common";

const APP_ID_INSTRUCTION = getAppIdInstruction(2);

export const fix_issue = prompt(
  {
    name: "fix_issue",
    omitPrefix: false,
    description: "Fix a Crashlytics issue",
    arguments: [
      {
        name: "app_id",
        description: "A Firebase app id.",
        required: false,
      },
      {
        name: "issue_id",
        description: "A Crashlytics issue id.",
        required: true,
      },
    ],
    annotations: {
      title: "Prioritize Crashlytics Issues",
    },
  },
  async ({ app_id, issue_id }, { accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to fix a specific issue from Crashlytics.

Active user: ${accountEmail || "<NONE>"}
Active app: ${app_id || "<NONE>"}
Issue id: ${issue_id}

## Steps

1. ${ACTIVE_USER_INSTRUCTION}
2. ${APP_ID_INSTRUCTION}
3. Make sure you have a good understanding of the code structure and where different functionality exists
4. Use the 'crashlytics_get_issue_details' tool to get more context on the issue.
5. Use the 'crashlytics_get_sample_crash_for_issue' tool to get 3 example crashes for this issue.
6. Read the files that exist in the stack trace of the issue to understand the crash deeply.
7. Determine the root cause of the crash.
8. Write out a plan using the following criteria:
   8a. Write out a description of the issue and including
       * A brief description of the cause of the issue
       * A determination of your level of confidence in the cause of the issue
       * A determination of which library is at fault, this codebase or a dependent library
       * A determination for how complex the fix will be
   8b. The plan should include relevant files to change
   8c. The plan should include a test plan to verify the fix
   8d. Use the following format for the plan:

   **Cause**
   <A description of the cause of the issue>
  
   **Confidence**: <one of "not at all confident", "somewhat confident", "confident", "very confident">
   **Fault**: <a determination of whether this code base is at fault or a dependent library is at fault>
   **Complexity**: <one of "simple", "moderately simple", "moderately hard", "hard", "oof, I don't know where to start">
   
   **Fix**
   <A plan for how to fix the issue>

   **Test**
   <a plan for how to test that the issue has been fixed an protect against regressions>

9. Present the plan to the user and get approval before making the change.
10. Fix the issue.
   10a. Be mindful of API contracts and do not add fields to resources without a clear way to populate those fields
   10b. If there is not enough information in the crash report to find a root cause, describe why you cannot fix the issue instead of making a guess.
11. Ask the developer if they would like you to test the fix for them.
`.trim(),
        },
      },
    ];
  },
);
