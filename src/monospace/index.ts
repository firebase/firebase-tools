import fetch from "node-fetch";
import { GoogleAuth } from "google-auth-library";

import * as apiv2 from "../apiv2";
import { FirebaseError } from "../error";

import type { GetInitFirebaseResponse, InitFirebaseResponse } from "./interfaces";

const MONOSPACE_DAEMON_PORT = process.env.MONOSPACE_DAEMON_PORT;

/**
 * Integrate Firebase Plugin with Monospace’s service Account Authentication
 */
export async function setupMonospace(client: GoogleAuth, project?: string): Promise<void> {
  const accessToken = await client.getAccessToken();

  if (!accessToken) throw new Error("Failed to get access token");

  apiv2.setAccessToken(accessToken);

  const initFirebaseResponse = await initFirebase(project);

  if (initFirebaseResponse.success === false) {
    // TODO: handle errors case by case if we ever have anything different than NOT_INITIALIZED?
    throw new Error(String(initFirebaseResponse.error));
  }

  const { rid } = initFirebaseResponse;

  // Poll for response from the user
  const authorizedProject = await pollAuthorizedProject(rid);

  if (project === authorizedProject) return;

  // TODO: create a .firebaserc in user’s folder like this:
  // projects: {
  //   default: "<authorizedProject>",
  // }
}

/**
 * Poll for response from the user
 * Every 1(currently 5) second or so to check if response is available for the request
 */
async function pollAuthorizedProject(rid: string): Promise<string> {
  // Note: Since Step1 pops up a dialog and waits for user response, it might take
  // some time for the response to become available.

  const getInitFirebaseRes = await getInitFirebaseResponse(rid);

  // Success case: If the user successfully completes the steps in the popup,
  // you'll see a response below
  if ("userResponse" in getInitFirebaseRes) {
    return getInitFirebaseRes.userResponse.projectId;
  }

  const { error } = getInitFirebaseRes;

  // Wait response: User hasn’t finished the interaction yet
  if (error === "WAITING_FOR_RESPONSE") {
    // If you get this error, wait 5 more seconds and call back.
    await new Promise((res) => setTimeout(res, 1000));

    // TODO: decide how long to ultimately wait before declaring
    // that the user is never going to respond.

    return pollAuthorizedProject(rid);
  }

  // FIXME: This is not being reached as the process exits before a new call is made

  // Error Response: User Canceled without authorizing any project
  if (error === "USER_CANCELED") {
    // If you see this error the user hasn’t authorized any project.
    // Display appropriate error message.
    throw new FirebaseError("User canceled without authorizing any project");
  }

  throw new FirebaseError(`Unhandled /get-init-firebase-response error: ${error}`);
}

/**
 * Step 1: Make call to init Firebase, get request id (rid) or error
 */
async function initFirebase(project?: string): Promise<InitFirebaseResponse> {
  const initFirebaseURL = new URL(`http://localhost:${MONOSPACE_DAEMON_PORT}/init-firebase`);

  if (project) {
    initFirebaseURL.searchParams.set("known_project", project);
  }

  const initFirebaseRes = await fetch(initFirebaseURL.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const initFirebaseResponse: InitFirebaseResponse = await initFirebaseRes.json();

  return initFirebaseResponse;
}

/**
 * Step 2: Get response from the user - authorized project or error
 */
async function getInitFirebaseResponse(rid: string): Promise<GetInitFirebaseResponse> {
  const getInitFirebaseRes = await fetch(
    `http://localhost:${MONOSPACE_DAEMON_PORT}/get-init-firebase-response?rid=${rid}`
  );

  const getInitFirebaseJson: GetInitFirebaseResponse = await getInitFirebaseRes.json();

  return getInitFirebaseJson;
}
