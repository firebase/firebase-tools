import { prompt } from "../../prompt";

export const runTest = prompt(
  {
    name: "run_test",
    description: "Run a test with the Firebase App Testing agent",
    omitPrefix: false,
    arguments: [
      {
        name: "testDescription",
        description:
          "Description of the test you want to run. The agent will use the description to generate a test case that will be used as input for the AI-guided test",
        required: false,
      },
    ],
    annotations: {
      title: "Run an App Testing AI-guided test",
    },
  },
  async ({ testDescription }, { accountEmail, projectId }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
You are going to help a developer run a test for their mobile app 
using the Firebase App Testing agent.

Active user: ${accountEmail || "<NONE>"}
Project ID: ${projectId || "<NONE>"}

## Prerequisites

Here are a list of prerequisite steps that must be completed before running a test.

1. **Make sure this is an Android app**. The App Testing agent only works with Android apps. If 
   this is not an Android app, instruct the user that this command can't be used with this app.

2. **Make sure the user is logged in. No App Testing tools will work if the user is not logged in.**
  a. Use the \`firebase_get_environment\` tool to verify that the user is logged in.
  b. If the Firebase 'Active user' is set to <NONE>, instruct the user to run \`firebase login\` 
      before continuing. Ignore other fields that are set to <NONE>. We are just making sure the
      user is logged in. 

3. **Get the Firebase app ID.** 

  The \`firebase_get_environment\` tool should return a list of detected app IDs, where the app
  ID contains four colon (":") delimited parts: a version number (typically "1"), a project
  number, a platform type ("android", "ios", or "web"). Ask the user confirm if there is only
  a single app ID, or to choose one if there are multiple app IDs. 

  If the tool does not return a list of detected apps, just ask the user for it.
  
4. **Confirm that the application ID of the app matches the bundle ID of the Firebase app**

  The \`firebase_get_environment\` tool returns a list of detected app IDs mapped to their corresponding
  bundle IDs. If the developer selected an app ID from the the list of detected app IDs, this already
  confirms that the bundle ID matches the app ID. If not, get the application IDs of all the variants of
  the app. Then get the bundle ID of the Firebase app by calling the \`firebase_list_apps\` tool and
  confirming that the \`namespace\` field of the app with the selected app ID matches one of the application
  IDs of the variants.
    
## Test Case Generation

  Once you have completed the required steps, you need the help the user generate a "test case", which is the input to the
  app testing agent. A test case consists of multiple steps where each step contains the following fields:

	* Goal (required): In one sentence or less, describe what you want the agent to do in this step.
	* Hint (optional): Provide additional information to help Gemini understand and navigate your app.
	* Success Criteria (optional): Your success criteria should be phrased as an observation, such as 'The screen shows a
    success message' or 'The checkout page is visible'.

  The developer has optionally specified the following description for their test:
  * ${testDescription}

  Sometimes, test descriptions that developers provide tend to be too vague and lack the necessary details for the
  app testing agent to be able to reliably re-run the tests with consistent results. Test cases should follow these
  guidelines to ensure that they are structured in a way to make the agent more reliable.

	* Prefer multiple steps with smaller, detailed goals. Broader, more open-ended goals can lead to unreliable tests 
    since the app testing agent can more easily veer of course. It should only take a few actions to accomplish a goal.
    For example, if a step has a list in it, it should probably be broken up into multiple steps. Steps do not need
    to be too small though. The test case should provide a good balance between strict guidance and flexibility. As a
    rule of thumb, each step should require between 2-5 actions.
	* Include a hint and success criteria whenever possible. Specifically, try to always include a success criteria to help
    the agent determine when the goal has been completed.
	* Avoid functionality that the app testing agent struggles with. The app testing agent struggles with the following:
		* Journeys that require specific timing (like observing that something should be visible for a certain number of
      seconds), interacting with moving or transient elements, etc.
		* Playing games or generally interacting with drawn visuals that would require pixel input
 		* Complex swipe interactions, multi-finger gestures, etc., which aren't supported
  
  First, analyze the code to get an understanding of how the app works. Get all the available screens in the app and the
  different actions for each screen. Understand what functionality is and isn't available to the app testing agent.
  Only include specific details in the test case if you are certain they will be available to the agent, otherwise the
  agent will likely fail if it tries to follow specific guidance that doesn't work (e.g. click the 'Play' button but the
  button isn't visible to the app testing agent). Do not include Android resource ids in the test case. Include
  explanations that prove that each step includes between 2-5 actions. Using that information as context and the guidelines
  above, convert the test description provided by the user to make it easier for the agent to follow so that the tests can
  be re-run reliably. If there is no test description, generate a test case that you think will be useful given the functionality 
  of the app. Generate an explanation on why you generated the new test case the way you did, and then generate the
  new test case, which again is an array of steps where each step contains a goal, hint, and success criteria. Show this
  to the user and have them confirm before moving forward. 

## Run Test

  Use the apptesting_run_test tool to run an automated test with the following as input:
    * The generated test case that as been confirmed by the user
    * An APK. If there is no APK present, build the app to produce one. Make sure to build the variant of the app
      with the same bundle ID as the Firebase app. When searching for the APK, it may be located in a directory that
      is being ignored by git, so you you may need to search directories that are listed in the .gitignore file.
`.trim(),
        },
      },
    ];
  },
);
