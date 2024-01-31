import { Client } from "../apiv2";
import { extensionsTOSOrigin } from "../api";
import { logger } from "../logger";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import { logPrefix } from "./extensionsHelper";
import * as utils from "../utils";

const VERSION = "v1";
const extensionsTosUrl = (tos: string) => `https://firebase.google.com/terms/extensions/${tos}`;

export interface TOS {
  name: string;
  lastAcceptedVersion?: string;
  lastAcceptedTime?: string;
  latestTosVersion: string;
}
export type PublisherTOS = TOS;
export type AppDevTOS = TOS;

const apiClient = new Client({ urlPrefix: extensionsTOSOrigin, apiVersion: VERSION });

export async function getAppDeveloperTOSStatus(projectId: string): Promise<AppDevTOS> {
  const res = await apiClient.get<AppDevTOS>(`/projects/${projectId}/appdevtos`);
  return res.body;
}

export async function acceptAppDeveloperTOS(
  projectId: string,
  tosVersion: string,
  instanceId: string = "",
): Promise<AppDevTOS> {
  const res = await apiClient.post<
    { name: string; instanceId: string; version: string },
    AppDevTOS
  >(`/projects/${projectId}/appdevtos:accept`, {
    name: `project/${projectId}/appdevtos`,
    instanceId,
    version: tosVersion,
  });
  return res.body;
}

export async function getPublisherTOSStatus(projectId: string): Promise<PublisherTOS> {
  const res = await apiClient.get<PublisherTOS>(`/projects/${projectId}/publishertos`);
  return res.body;
}

export async function acceptPublisherTOS(
  projectId: string,
  tosVersion: string,
): Promise<PublisherTOS> {
  const res = await apiClient.post<{ name: string; version: string }, PublisherTOS>(
    `/projects/${projectId}/publishertos:accept`,
    {
      name: `project/${projectId}/publishertos`,
      version: tosVersion,
    },
  );
  return res.body;
}

export async function acceptLatestPublisherTOS(
  options: { force?: boolean; nonInteractive?: boolean },
  projectId: string,
): Promise<PublisherTOS | undefined> {
  try {
    logger.debug(`Checking if latest publisher TOS has been accepted by ${projectId}...`);
    const currentAcceptance = await getPublisherTOSStatus(projectId);
    if (currentAcceptance.lastAcceptedVersion) {
      logger.debug(
        `Already accepted version ${currentAcceptance.lastAcceptedVersion} of Extensions publisher TOS.`,
      );
      return currentAcceptance;
    } else {
      // Display link to TOS, prompt for acceptance
      const tosLink = extensionsTosUrl("publisher");
      logger.info(
        `To continue, you must accept the Firebase Extensions Publisher Terms of Service: ${tosLink}`,
      );
      if (
        await confirm({
          ...options,
          message: "Do you accept the Firebase Extensions Publisher Terms of Service?",
        })
      ) {
        return acceptPublisherTOS(projectId, currentAcceptance.latestTosVersion);
      }
    }
  } catch (err: any) {
    // This is a best effort check. When authenticated via a service account instead of OAuth, we cannot
    // make calls to a private API. The extensions backend will also check TOS acceptance at instance CRUD time.
    logger.debug(
      `Error when checking Publisher TOS for ${projectId}. This is expected if authenticated via a service account: ${err}`,
    );
    return;
  }
  throw new FirebaseError("You must accept the terms of service to continue.");
}

export async function acceptLatestAppDeveloperTOS(
  options: { force?: boolean; nonInteractive?: boolean },
  projectId: string,
  instanceIds: string[],
): Promise<AppDevTOS[]> {
  try {
    logger.debug(`Checking if latest AppDeveloper TOS has been accepted by ${projectId}...`);
    displayDeveloperTOSWarning();
    const currentAcceptance = await getAppDeveloperTOSStatus(projectId);
    if (currentAcceptance.lastAcceptedVersion) {
      logger.debug(`User Terms of Service aready accepted on project ${projectId}.`);
    } else if (
      !(await confirm({
        ...options,
        message: "Do you accept the Firebase Extensions User Terms of Service?",
      }))
    ) {
      throw new FirebaseError("You must accept the terms of service to continue.");
    }
    const tosPromises = instanceIds.map((instanceId) => {
      return acceptAppDeveloperTOS(projectId, currentAcceptance.latestTosVersion, instanceId);
    });
    return Promise.all(tosPromises);
  } catch (err: any) {
    // This is a best effort check. When authenticated via a service account instead of OAuth, we cannot
    // make calls to a private API. The extensions backend will also check TOS acceptance at instance CRUD time.
    logger.debug(
      `Error when checking App Developer TOS for ${projectId}. This is expected if authenticated via a service account: ${err}`,
    );
    return [];
  }
}

export function displayDeveloperTOSWarning(): void {
  const tosLink = extensionsTosUrl("user");
  utils.logLabeledBullet(
    logPrefix,
    `By installing an extension instance onto a Firebase project, you accept the Firebase Extensions User Terms of Service: ${tosLink}`,
  );
}
