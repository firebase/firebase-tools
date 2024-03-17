import * as fuzzy from "fuzzy";
import * as inquirer from "inquirer";
import { AppPlatform, createWebApp, listFirebaseApps } from "../../../management/apps";
import { promptOnce } from "../../../prompt";
import { FirebaseError } from "../../../error";

// Note: exported like this for testing (to stub a function in the same file).
const webApps = {
  getOrCreateWebApp,
  promptFirebaseWebApp,
};

const CREATE_NEW_FIREBASE_WEB_APP = "CREATE_NEW_WEB_APP";

type FirebaseWebApp = { name: string; id: string };

/**
 *
 * @param projectId user's projectId
 * @param firebaseWebAppName (optional) name of web app
 * @return app name and app id
 */
async function getOrCreateWebApp(
  projectId: string,
  firebaseWebAppName: string | null,
  backendId: string,
): Promise<FirebaseWebApp> {
  let firebaseWebAppId: string;

  const existingUserProjectWebApps = new Map(
    (await listFirebaseApps(projectId, AppPlatform.WEB)).map((obj) => [
      // displayName can be null, use name instead if so. Example - displayName: "mathusan-web-app", name: "projects/mathusan-fwp/webApps/1:461896338144:web:426291191cccce65fede85"
      obj.displayName ?? obj.name,
      obj.appId,
    ]),
  );

  if (existingUserProjectWebApps.size === 0) {
    // create a web app using backend id
    const newWebApp = await createWebApp(projectId, { displayName: backendId });
    return { name: newWebApp.displayName, id: newWebApp.appId };
  }

  if (firebaseWebAppName) {
    if (existingUserProjectWebApps.get(firebaseWebAppName) === undefined) {
      throw new FirebaseError(
        `The web app '${firebaseWebAppName}' does not exist in project ${projectId}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    firebaseWebAppId = existingUserProjectWebApps.get(firebaseWebAppName)!;
  } else {
    return await webApps.promptFirebaseWebApp(projectId, existingUserProjectWebApps);
  }

  return { name: firebaseWebAppName, id: firebaseWebAppId };
}

/**
 * Prompts the user for the web app that they would like to associate their backend with
 * @param projectId user's projectId
 * @param existingUserProjectWebApps a map of a user's firebase web apps to their ids
 * @return the name and ID of a web app
 */
async function promptFirebaseWebApp(
  projectId: string,
  existingUserProjectWebApps: Map<string, string>,
): Promise<FirebaseWebApp> {
  const searchWebApps =
    (existingWebApps: string[]) =>
    // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-explicit-any
    async (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return [
        new inquirer.Separator(),
        {
          name: "Create a new Firebase web app.",
          value: CREATE_NEW_FIREBASE_WEB_APP,
        },
        new inquirer.Separator(),
        ...fuzzy.filter(input, existingWebApps).map((result) => {
          return result.original;
        }),
      ];
    };

  const firebaseWebAppName = await promptOnce({
    type: "autocomplete",
    name: "app",
    message:
      "Which of the following Firebase web apps would you like to associate your backend with?",
    source: searchWebApps(Array.from(existingUserProjectWebApps.keys())),
  });

  if (firebaseWebAppName === CREATE_NEW_FIREBASE_WEB_APP) {
    const newAppDisplayName = await promptOnce({
      type: "input",
      name: "webAppName",
      message: "Enter a unique name for your web app",
    });

    const newFirebaseWebApp = await createWebApp(projectId, { displayName: newAppDisplayName });
    return { name: newFirebaseWebApp.displayName, id: newFirebaseWebApp.appId };
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { name: firebaseWebAppName, id: existingUserProjectWebApps.get(firebaseWebAppName)! };
}

export = webApps;
