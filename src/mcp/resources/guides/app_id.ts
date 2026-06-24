import { resource } from "../../resource";

export const RESOURCE_CONTENT = `
### Firebase App ID
  The Firebase App ID is used to identify a mobile or web client application to Firebase back end services such as Crashlytics or Remote Config. Use the information below to find the developer's App ID.

  1. **PRIORITIZE REMEMBERED APP ID ENTRIES** If an entry for this directory exists in the remembered app ids, use the remembered app id 
       for this directory without presenting any additional options.
       i. If there are multiple remembered app ids for this directory, ask the user to choose one by providing 
          a numbered list of all the package names. Tell them that these values came from memories and how they can modify those values.
  2. **IF THERE IS NO REMEMBERED ENTRY FOR THIS DIRECTORY** Use the app IDs from the \`firebase_get_environment\` tool. 
       i. If you've already called this tool, use the previous response from context.
       ii. If the 'Detected App IDs' is set to <NONE>, ask the user for the value they want to use.
       iii. If there are multiple 'Detected App IDs', ask the user to choose one by providing 
            a numbered list of all the package names and app ids.
  3. **IF THERE IS A REMEMBERED VALUE BUT IT DOES NOT MATCH ANY DETECTED APP IDS** Ask if the user would like to replace the value with one of
       the detected values.
       i. **Description:** A valid app ID to remember contains four colon (":") delimited parts: a version 
          number (typically "1"), a project number, a platform type ("android", "ios", or "web"), 
          and a sequence of hexadecimal characters. 
       ii. Replace the value for this directory with this valid app id, the android package name or ios bundle identifier, and the project directory.
  4. **IF THERE IS NO REMEMBERED ENTRY FOR THIS DIRECTORY** Ask if the user would like to remember the app id selection
       i. **Description:** A valid app ID to remember contains four colon (":") delimited parts: a version 
          number (typically "1"), a project number, a platform type ("android", "ios", or "web"), 
          and a sequence of hexadecimal characters. 
       ii. Store the valid app id value, the android package name or ios bundle identifier, and the project directory.
`.trim();

export const app_id = resource(
  {
    uri: "firebase://guides/app_id",
    name: "app_id_guide",
    title: "Firebase App Id Guide",
    description:
      "guides the coding agent through choosing a Firebase App ID in the current project",
  },
  async (uri) => {
    return {
      contents: [{ uri, type: "text", text: RESOURCE_CONTENT }],
    };
  },
);
