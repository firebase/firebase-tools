import { prompt } from "../../prompt";

export const fix_issue = prompt(
  {
    name: "fix_issue",
    omitPrefix: false,
    description: "Fix a Crashlytics issue",
    arguments: [
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
  async ({ prompt }, { config, projectId, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
Your goal is to fix a specific issue from Crashlytics.

Active user: ${accountEmail || "<NONE>"}
Active project: ${projectId || "<NONE>"}

Contents of \`firebase.json\` config file:

\`\`\`json
${config.readProjectFile("firebase.json", { fallback: "<FILE DOES NOT EXIST>" })}
\`\`\`

## Steps

Follow the steps below taking note of any user instructions provided above.

1. If there is no active user, prompt the user to run \`firebase login\` in an interactive terminal before continuing.
2. If there is no \`firebase.json\` file and the current workspace is a static web application, manually create a \`firebase.json\` with \`"hosting"\` configuration based on the current directory's web app configuration. Add a \`{"hosting": {"predeploy": "<build_script>"}}\` config to build before deploying.
3. If there is no active project, ask the user if they want to use the project id from the \`firebase.json\` file or provide a different project id.
  3a. If there is no \`firebase.json\` file, then just ask the user to provide a project id.
4. Use the \`crashlytics_get_issue\` tool to fetch the issue.
5. Use the issue details with the code you have access to, to determine the root cause of the crash.
6. Write out a description of the issue, a plan for how to fix it, and a plan for a test to verify the fix in the following format:
   **Cause**
   <A description of the cause of the issue>

   **Fix**
   <A plan for how to fix the issue>

   **Test**
   <a plan for how to test that the issue has been fixed an protect against regressions>
7. Present the plan to the user and get approval before making the change.
8. Fix the issue.
9. Run the test to verify the fix.
`.trim(),
        },
      },
    ];
  },
);
