import * as fuzzy from "fuzzy";
import * as inquirer from "inquirer";
import { AppPlatform, WebAppMetadata, createWebApp, listFirebaseApps } from "../management/apps";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";

const CREATE_NEW_FIREBASE_WEB_APP = "CREATE_NEW_WEB_APP";
const CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP = "CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP";

// Note: exported like this for testing (to stub a function in the same file).
const webApps = {
  CREATE_NEW_FIREBASE_WEB_APP,
  CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP,
  getOrCreateWebApp,
  promptFirebaseWebApp,
};

type FirebaseWebApp = { name: string; id: string };

/**
 * If firebaseWebAppName is provided and a matching web app exists, it is
 * returned. If firebaseWebAppName is not provided then the user is prompted to
 * choose from one of their existing web apps or to create a new one or to skip
 * without selecting a web app. If user chooses to create a new web app,
 * a new web app with the given backendId is created. If user chooses to skip
 * without selecting a web app nothing is returned.
 * @param projectId user's projectId
 * @param firebaseWebAppName (optional) name of an existing Firebase web app
 * @param backendId name of the app hosting backend
 * @return app name and app id
 */
async function getOrCreateWebApp(
  projectId: string,
  firebaseWebAppName: string | null,
  backendId: string,
): Promise<FirebaseWebApp | undefined> {
  const webAppsInProject = await listFirebaseApps(projectId, AppPlatform.WEB);

  if (webAppsInProject.length === 0) {
    // create a web app using backend id
    const { displayName, appId } = await createFirebaseWebApp(projectId, {
      displayName: backendId,
    });
    return { name: displayName, id: appId };
  }

  const existingUserProjectWebApps = new Map(
    webAppsInProject.map((obj) => [
      // displayName can be null, use app id instead if so. Example - displayName: "mathusan-web-app", appId: "1:461896338144:web:426291191cccce65fede85"
      obj.displayName ?? obj.appId,
      obj.appId,
    ]),
  );

  if (firebaseWebAppName) {
    if (existingUserProjectWebApps.get(firebaseWebAppName) === undefined) {
      throw new FirebaseError(
        `The web app '${firebaseWebAppName}' does not exist in project ${projectId}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { name: firebaseWebAppName, id: existingUserProjectWebApps.get(firebaseWebAppName)! };
  }

  return await webApps.promptFirebaseWebApp(projectId, backendId, existingUserProjectWebApps);
}

/**
 * Prompts the user for the web app that they would like to associate their backend with
 * @param projectId user's projectId
 * @param backendId user's backendId
 * @param existingUserProjectWebApps a map of a user's firebase web apps to their ids
 * @return the name and ID of a web app
 */
async function promptFirebaseWebApp(
  projectId: string,
  backendId: string,
  existingUserProjectWebApps: Map<string, string>,
): Promise<FirebaseWebApp | undefined> {
  const existingWebAppKeys = Array.from(existingUserProjectWebApps.keys());

  const firebaseWebAppName = await promptOnce({
    type: "autocomplete",
    name: "app",
    message:
      "Which of the following Firebase web apps would you like to associate your backend with?",
    source: (_: any, input = ""): Promise<(inquirer.DistinctChoice | inquirer.Separator)[]> => {
      return new Promise((resolve) =>
        resolve([
          new inquirer.Separator(),
          {
            name: "Create a new Firebase web app.",
            value: CREATE_NEW_FIREBASE_WEB_APP,
          },
          {
            name: "Continue without a Firebase web app.",
            value: CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP,
          },
          new inquirer.Separator(),
          ...fuzzy.filter(input, existingWebAppKeys).map((result) => {
            return result.original;
          }),
        ]),
      );
    },
  });

  if (firebaseWebAppName === CREATE_NEW_FIREBASE_WEB_APP) {
    const newFirebaseWebApp = await createFirebaseWebApp(projectId, { displayName: backendId });
    return { name: newFirebaseWebApp.displayName, id: newFirebaseWebApp.appId };
  } else if (firebaseWebAppName === CONTINUE_WITHOUT_SELECTING_FIREBASE_WEB_APP) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { name: firebaseWebAppName, id: existingUserProjectWebApps.get(firebaseWebAppName)! };
}

/**
 * A wrapper for createWebApp to catch and log quota errors
 */
async function createFirebaseWebApp(
  projectId: string,
  options: { displayName?: string },
): Promise<WebAppMetadata> {
  try {
    return await createWebApp(projectId, options);
  } catch (e) {
    if (isQuotaError(e)) {
      throw new FirebaseError(
        "Unable to create a new web app, the project has reached the quota for Firebase apps. Navigate to your Firebase console to manage or delete a Firebase app to continue. ",
        { original: e instanceof Error ? e : undefined },
      );
    }

    throw new FirebaseError("Unable to create a Firebase web app", {
      original: e instanceof Error ? e : undefined,
    });
  }
}

/**
 * TODO: Make this generic to be re-used in other parts of the CLI
 */
function isQuotaError(error: any): boolean {
  const original = error.original as any;
  const code: number | undefined =
    original?.status ||
    original?.context?.response?.statusCode ||
    original?.context?.body?.error?.code;

  return code === 429;
}

export = webApps;
