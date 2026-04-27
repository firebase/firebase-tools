import { prompt } from "../../prompt";
import { RESOURCE_CONTENT as connectResourceContent } from "../../resources/guides/crashlytics_connect";

export const connect = prompt(
  "crashlytics",
  {
    name: "connect",
    omitPrefix: false,
    description: "Use this command to access a Firebase application's Crashlytics data.",
    annotations: {
      title: "Access Crashlytics data",
    },
  },
  async (unused, { accountEmail, firebaseCliCommand }) => {
    const loggedInInstruction = `
**The user is logged into Firebase as ${accountEmail || ""}.
    `.trim();

    const notLoggedInInstruction = `
**Instruct the User to Log In**
  The user is not logged in to Firebase. None of the Crashlytics tools will be able to authenticate until the user has logged in. Instruct the user to run \`${firebaseCliCommand} login\` before continuing, then use the \`firebase_get_environment\` tool to verify that the user is logged in.
    `.trim();

    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
You will assist developers in investigating and resolving mobile application issues by leveraging Firebase Crashlytics data. 

### Required First Steps

  ${accountEmail ? loggedInInstruction : notLoggedInInstruction}

**Obtain the Firebase App ID.** 
    If an App ID is not readily available, consult this guide for selection: [Firebase App Id Guide](firebase://guides/app_id).

${connectResourceContent}
`.trim(),
        },
      },
    ];
  },
);
