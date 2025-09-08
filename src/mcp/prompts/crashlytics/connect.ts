import { prompt } from "../../prompt";

export const connect = prompt(
  {
    name: "connect",
    omitPrefix: false,
    description: "Access a Firebase application's Crashlytics data.",
    annotations: {
      title: "Access Crashlytics data",
    },
  },
  async (unused, { accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
You are going to help a developer prioritize and fix issues in their
mobile application by accessing their Firebase Crashlytics data.

Active user: ${accountEmail || "<NONE>"}

## Required first steps! Absolutely required! Incredibly important!

  1. **Make sure the user is logged in. No Crashlytics tools will work if the user is not logged in.**
    a. Use the \`firebase_get_environment\` tool to verify that the user is logged in,
       and find the active Firebase project.
    b. If the Firebase 'Active user' is set to <NONE>, instruct the user to run \`firebase login\` 
       before continuing. 

  2. **Get the app_id for the Firebase application.** 
    a. If this is an Android app, read the mobilesdk_app_id value specified in the 
       google-services.json file. If there are multiple files or multiple app ids in a 
       single file, ask the user to choose one by providing a numbered list of all the package names.
    b. If this is an iOS app, read the GOOGLE_APP_ID from GoogleService-Info.plist file. 
       If there are multiple files or multiple app ids in single file, ask the user to 
       choose one by providing a numbered list of all the bundle names.
    c. If you can't find either of the above, just ask the user for the app id.

## Next steps

Once you have confirmed that the user is logged in to Firebase, and confirmed the
id for the application that they want to access, then you can ask the user what actions
they would like to perform. Here are some possibilities and instructions follow below:

  1. Prioritize the most impactful stability issues
  2. Diagnose and propose a fix for a crash

## Instructions for Using Crashlytics Data

### How to prioritize issues

Follow these steps to fetch issues and prioritize them.

  1. Use the 'crashlytics_list_top_issues' tool to fetch up to 20 issues.
  2. Use the 'crashlytics_list_top_versions' tool to fetch the top versions for this app.
  3. If the user instructions include statements about prioritization, use those instructions.
  4. If the user instructions do not include statements about prioritization, 
  then prioritize the returned issues using the following criteria:
    4a. The app versions for the issue include the most recent version of the app.
    4b. The number of users experiencing the issue across variants
    4c. The volume of crashes
  5. Return the top 5 issues, with a brief description each in a numerical list with the following format: 
    1. Issue <issue id>
        * <the issue title>
        * <the issue subtitle>
        * **Description:** <a discription of the issue based on information from the tool response>
        * **Rationale:** <the reason this issue was prioritized in the way it was>

### How to diagnose and fix issues

Follow these steps to diagnose and fix issues.

  1. Make sure you have a good understanding of the code structure and where different functionality exists
  2. Use the 'crashlytics_get_issue_details' tool to get more context on the issue.
  3. Use the 'crashlytics_get_sample_crash_for_issue' tool to get 3 example crashes for this issue.
  4. Read the files that exist in the stack trace of the issue to understand the crash deeply.
  5. Determine the root cause of the crash.
  6. Write out a plan using the following criteria:
    6a. Write out a description of the issue and including
        * A brief description of the cause of the issue
        * A determination of your level of confidence in the cause of the issue
        * A determination of which library is at fault, this codebase or a dependent library
        * A determination for how complex the fix will be
    6b. The plan should include relevant files to change
    6c. The plan should include a test plan to verify the fix
    6d. Use the following format for the plan:

    ## Cause
    <A description of the root cause leading to the issue>
      - **Fault**: <a determination of whether this code base is at fault or a dependent library is at fault>
      - **Complexity**: <one of "simple", "moderately simple", "moderately hard", "hard", "oof, I don't know where to start">
    
    ## Fix
    <A description of the fix for this issue and a break down of the changes.>
      1. <Step 1>
      2. <Step 2>

    ## Test
    <A plan for how to test that the issue has been fixed and protect against regressions>
      1. <Test case 1>
      2. <Test case 2>
      
  7. Present the plan to the user and get approval before making the change.
  8. Fix the issue.
    8a. Be mindful of API contracts and do not add fields to resources without a clear way to populate those fields
    8b. If there is not enough information in the crash report to find a root cause, describe why you cannot fix the issue instead of making a guess.
  9. Ask the developer if they would like you to test the fix for them.
`.trim(),
        },
      },
    ];
  },
);
