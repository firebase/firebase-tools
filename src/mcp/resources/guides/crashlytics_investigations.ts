import { resource } from "../../resource";

const RESOURCE_CONTENT = `
### How to Diagnose and Fix Crashlytics Issues

  Follow these steps to diagnose bugs and and propose fixes for issues.

  1. Make sure you have a good understanding of the code structure and where different functionality exists.
  2. Use the 'crashlytics_get_issue' tool to get more context on the issue.
  3. Use the 'crashlytics_batch_get_events' tool to get an example crash for this issue. Use the event names in the sampleEvent fields.
    3a. If you need to read more events, use the 'crashlytics_list_events' tool.
    3b. Apply the same filtering criteria that you used to find the issue, so that you find a appropriate events.
  4. Read the files that exist in the stack trace of the issue to understand the crash deeply.
  5. Determine possible root causes for the crash - no more than 5 potential root causes.
  6. Critique your own determination, analyzing how plausible each scenario is given the crash details.
  7. Choose the most likely root cause given your analysis.
  8. Create a plan for the most likely root cause using the following format for the plan:

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
      
  9. If there is not enough information in the crash report to find a root cause, describe why you cannot fix the issue instead of making a guess.
`.trim();

export const crashlytics_investigations = resource(
  {
    uri: "firebase://guides/crashlytics/investigations",
    name: "crashlytics_investigations_guide",
    title: "Firebase Crashlytics Investigations Guide",
    description:
      "Guides the coding agent when investigating bugs reported in Crashlytics issues, including procedures for diagnosing and fixing crashes.",
  },
  async (uri) => {
    return {
      contents: [{ uri, type: "text", text: RESOURCE_CONTENT }],
    };
  },
);
