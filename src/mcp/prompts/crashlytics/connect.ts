import { prompt } from "../../prompt";

export const connect = prompt(
  "crashlytics",
  {
    name: "connect",
    omitPrefix: false,
    description: "Access a Firebase application's Crashlytics data.",
    annotations: {
      title: "Access Crashlytics data",
    },
  },
  async (unused, { accountEmail, firebaseCliCommand }) => {
    const loggedInInstruction = `
**The user is logged into Firebase as ${accountEmail || ""}.
    `.trim();

    const notLoggedInInstruction = `
**Instruct the User to Log In***
  The user is not logged in to Firebase. None of the Crashlytics tools will be able to authenticate until the user has logged in. Instruct the user to run \`${firebaseCliCommand} login\` before continuing, then use the \`firebase_get_environment\` tool to verify that the user is logged in.
    `.trim();

    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
You will assist developers in investigating and resolving mobile application issues by leveraging Firebase Crashlytics data. Utilize the Firebase \`read_resources\` tool to access the following guides.

### Required First Steps

  ${accountEmail ? loggedInInstruction : notLoggedInInstruction}

**Obtain the Firebase App ID.** 
    If an App ID is not readily available, consult this guide for selection: [Firebase App Id Guide](firebase://guides/app_id).
### Next Steps

After confirming the user is logged into Firebase and the correct App ID is identified, inquire about the desired actions. Your capabilities include:
- Reading Crashlytics reports.
- Investigating bug reports using Crashlytics event data.
- Proposing code changes to resolve identified bugs.

Upon receiving user instructions, refer to the relevant resources for guidance:

  1. [Firebase Crashlytics Reports Guide](firebase://guides/crashlytics/reports)
     This guide details how to request and use aggregated numerical data from Crashlytics to prioritize and investigate issues.
    
  2. [Firebase Crashlytics Issues Guide](firebase://guides/crashlytics/issues)
     This guide details how to work with issues within Crashlytics.

  3. [Investigating Crashlytics Issues](firebase://guides/crashlytics/investigations)
     This guide provides instructions on investigating the root causes of crashes and exceptions reported in Crashlytics issues.
`.trim(),
        },
      },
    ];
  },
);
