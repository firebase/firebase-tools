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
    a. Use the \`firebase_get_environment\` tool to verify that the user is logged in.
    b. If the Firebase 'Active user' is set to <NONE>, instruct the user to run \`firebase login\` 
       before continuing. Ignore other fields that are set to <NONE>. We are just making sure the
       user is logged in. 

  2. **Get the app ID for the Firebase application.** 
     
    Use the information below to help you find the developer's app ID. If you cannot find it after 2-3 
    attempts, just ask the user for the value they want to use, providing the description of what the 
    value looks like.
    
    * **Description:** The app ID we are looking for contains four colon (":") delimited parts: a version 
      number (typically "1"), a project number, a platform type ("android", "ios", or "web"), 
      and a sequence of hexadecimal characters. This can be found in the project settings in the Firebase Console
      or in the appropriate google services file for the application type.
    * For Android apps, you will typically find the app ID in a file called google-services.json under the
      mobilesdk_app_id key. The file is most often located in the app directory that contains the src directory.
    * For iOS apps, you will typically find the app ID in a property list file called GoogleService-Info.plist under the
      GOOGLE_APP_ID key. The plist file is most often located in the main project directory.
    * Sometimes developers will not check in the google services file because it is a shared or public
      repository. If you can't find the file, the files may be included in the .gitignore. Check again for the file 
      removing restrictions around looking for tracked files.
    * Developers may have multiple google services files that map to different releases. In cases like this,
      developers may create different directories to hold each like alpha/google-services.json or alpha/GoogleService-Info.plist.
      In other cases, developers may change the suffix of the file to something like google-services-alpha.json or 
      GoogleService-Alpha.plist. Look for as many google services files as you can find.
    * Sometimes developers may include the codebase for both the Android app and the iOS app in the same repository.
    * If there are multiple files or multiple app IDs in a single file, ask the user to choose one by providing 
      a numbered list of all the package names.
    * Again, if you have trouble finding the app ID, just ask the user for it.

## Next steps

Once you have confirmed that the user is logged in to Firebase, and confirmed the
id for the application that they want to access, then you can ask the user what actions
they would like to perform. Here are some possibilities and instructions follow below:

  1. Prioritize the most impactful stability issues
  2. Diagnose and propose a fix for a crash

## Instructions for Using Crashlytics Data

### How to prioritize issues

Follow these steps to fetch issues and prioritize them.

  1. Use the 'crashlytics_get_top_issues' tool to fetch up to 20 issues.
    1a. Analyze the user's query and apply the appropriate filters.
    1b. If the user asks for crashes, then set the issueErrorType filter to *FATAL*.
    1c. If the user asks about a particular time range, then set both the intervalStartTime and intervalEndTime.
  2. Use the 'crashlytics_get_top_versions' tool to fetch the top versions for this app.
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
  6. Ask the user if they would like to diagnose and fix any of the issues presented

### How to diagnose and fix issues

Follow these steps to diagnose and fix issues.

  1. Make sure you have a good understanding of the code structure and where different functionality exists
  2. Use the 'crashlytics_get_issue' tool to get more context on the issue.
  3. Use the 'crashlytics_list_events' tool to get an example crash for this issue.
    3a. Apply the same filtering criteria that you used to find the issue, so that you find an appropriate event.
  4. Read the files that exist in the stack trace of the issue to understand the crash deeply.
  5. Determine possible root causes for the crash - no more than 5 potential root causes.
  6. Critique your own determination, analyzing how plausible each scenario is given the crash details.
  7. Choose the most likely root cause given your analysis.
  8. Write out a plan for the most likely root cause using the following criteria:
    8a. Write out a description of the issue and including
        * A brief description of the cause of the issue
        * A determination of your level of confidence in the cause of the issue using your analysis.
        * A determination of which library is at fault, this codebase or a dependent library
        * A determination for how complex the fix will be
    8b. The plan should include relevant files to change
    8c. The plan should include a test plan for how the user might verify the fix
    8d. Use the following format for the plan:

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

    ## Other potential causes
    1. <Another possible root cause>
    2. <Another possible root cause>
      
  9. Present the plan to the user and get approval before making the change.
  10. Only if they approve the plan, create a fix for the issue.
    10a. Be mindful of API contracts and do not add fields to resources without a clear way to populate those fields
    10b. If there is not enough information in the crash report to find a root cause, describe why you cannot fix the issue instead of making a guess.
`.trim(),
        },
      },
    ];
  },
);
