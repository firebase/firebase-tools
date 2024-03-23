import fetch from "node-fetch";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { loadRC } from "../rc";

import type {
  GetInitFirebaseResponse,
  InitFirebaseResponse,
  SetupMonospaceOptions,
} from "./interfaces";

const POLL_USER_RESPONSE_MILLIS = 2000;

/**
 * Integrate Firebase Plugin with Monospace’s service Account Authentication
 *
 * @return null if no project was authorized
 * @return string if a project was authorized and isVSCE is true
 * @return void if a project was authorized and isVSCE is falsy, creating
 * `.firebaserc` with authorized project using the default alias
 */
export async function selectProjectInMonospace({
  projectRoot,
  project,
  isVSCE,
}: SetupMonospaceOptions): Promise<void | string | null> {
  const initFirebaseResponse = await initFirebase(project);

  if (initFirebaseResponse.success === false) {
    throw new Error(String(initFirebaseResponse.error));
  }

  const { rid } = initFirebaseResponse;

  const authorizedProject = await pollAuthorizedProject(rid);

  if (!authorizedProject) return null;

  if (isVSCE) return authorizedProject;

  if (projectRoot) createFirebaseRc(projectRoot, authorizedProject);
}

/**
 * Since `initFirebase` pops up a dialog and waits for user response, it might
 * take some time for the response to become available. Here we poll for user's
 * response.
 */
async function pollAuthorizedProject(rid: string): Promise<string | null> {
  const getInitFirebaseRes = await getInitFirebaseResponse(rid);

  // If the user authorizes a project, `userResponse` will be available
  if ("userResponse" in getInitFirebaseRes) {
    if (getInitFirebaseRes.userResponse.success) {
      return getInitFirebaseRes.userResponse.projectId;
    }

    return null;
  }

  const { error } = getInitFirebaseRes;

  // Wait response: User hasn’t finished the interaction yet
  if (error === "WAITING_FOR_RESPONSE") {
    // wait and call back
    await new Promise((res) => setTimeout(res, POLL_USER_RESPONSE_MILLIS));

    // TODO: decide how long to ultimately wait before declaring
    // that the user is never going to respond.

    return pollAuthorizedProject(rid);
  }

  // TODO: Review this. It's not being reached as the process exits before a new
  // call is made

  // Error response: User canceled without authorizing any project
  if (error === "USER_CANCELED") {
    // The user hasn’t authorized any project.
    // Display appropriate error message.
    throw new FirebaseError("User canceled without authorizing any project");
  }

  throw new FirebaseError(`Unhandled /get-init-firebase-response error`, {
    original: new Error(error),
  });
}

/**
 * Make call to init Firebase, get request id (rid) or error
 */
async function initFirebase(project?: string): Promise<InitFirebaseResponse> {
  const port = getMonospaceDaemonPort();
  if (!port) throw new FirebaseError("Undefined MONOSPACE_DAEMON_PORT");

  const initFirebaseURL = new URL(`http://localhost:${port}/init-firebase`);

  if (project) {
    initFirebaseURL.searchParams.set("known_project", project);
  }

  const initFirebaseRes = await fetch(initFirebaseURL.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const initFirebaseResponse = (await initFirebaseRes.json()) as InitFirebaseResponse;

  return initFirebaseResponse;
}

/**
 * Get response from the user - authorized project or error
 */
async function getInitFirebaseResponse(rid: string): Promise<GetInitFirebaseResponse> {
  const port = getMonospaceDaemonPort();
  if (!port) throw new FirebaseError("Undefined MONOSPACE_DAEMON_PORT");

  const getInitFirebaseRes = await fetch(
    `http://localhost:${port}/get-init-firebase-response?rid=${rid}`,
  );

  const getInitFirebaseJson = (await getInitFirebaseRes.json()) as GetInitFirebaseResponse;

  logger.debug(`/get-init-firebase-response?rid=${rid} response:`);
  logger.debug(getInitFirebaseJson);

  return getInitFirebaseJson;
}

/**
 * Create a .firebaserc in the project's root with the authorized project
 * as the default project
 */
function createFirebaseRc(projectDir: string, authorizedProject: string): boolean {
  const firebaseRc = loadRC({ cwd: projectDir });

  firebaseRc.addProjectAlias("default", authorizedProject);

  return firebaseRc.save();
}

/**
 * Whether this is a Monospace environment
 */
export function isMonospaceEnv(): boolean {
  return getMonospaceDaemonPort() !== undefined;
}

/**
 * @return process.env.MONOSPACE_DAEMON_PORT
 */
function getMonospaceDaemonPort(): string | undefined {
  return process.env.MONOSPACE_DAEMON_PORT;
}
