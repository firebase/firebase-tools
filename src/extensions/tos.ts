import { Client } from "../apiv2";
import { extensionsTOSOrigin } from "../api";
import { logger } from "../logger";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";

const VERSION = "v1";
const extensionsTosUrl = (tos: string) => `https://firebase.google.com/terms/extensions/${tos}`;

export interface TOS {
  name: string;
  lastAcceptedVersion: string;
  lastAcceptedTime: string;
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
  instanceId: string = ""
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
  tosVersion: string
): Promise<PublisherTOS> {
  const res = await apiClient.post<{ name: string; version: string }, PublisherTOS>(
    `/projects/${projectId}/publishertos:accept`,
    {
      name: `project/${projectId}/publishertos`,
      version: tosVersion,
    }
  );
  return res.body;
}

export async function acceptLatestPublisherTOS(
  options: { force?: boolean; nonInteractive?: boolean },
  projectId: string
): Promise<PublisherTOS> {
  logger.debug(`Checking if latest publisher TOS has been accepted by ${projectId}...`);
  const currentAcceptance = await getPublisherTOSStatus(projectId);
  if (currentAcceptance.lastAcceptedVersion === currentAcceptance.latestTosVersion) {
    logger.debug(
      `Latest version of publisher TOS is ${currentAcceptance.lastAcceptedVersion}, already accepted.`
    );
    return currentAcceptance;
  } else {
    // Display link to TOS, prompt for acceptance
    const tosLink = extensionsTosUrl("publisher");
    logger.info(
      `To continue, you must accept the Extensions publisher terms of service: ${tosLink}`
    );
    if (
      await confirm({
        ...options,
        message: "Do you accept the Extensions publisher terms of service?",
      })
    ) {
      return acceptPublisherTOS(projectId, currentAcceptance.latestTosVersion);
    }
    throw new FirebaseError("Command terminated becuase publisher TOS was not accepted");
  }
}

export async function acceptLatestAppDeveloperTOS(
  options: { force?: boolean; nonInteractive?: boolean },
  projectId: string,
  instanceId: string = ""
): Promise<AppDevTOS> {
  logger.debug(
    `Checking if latest AppDeveloper TOS has been accepted by ${projectId}/${instanceId}...`
  );
  const currentAcceptance = await getAppDeveloperTOSStatus(projectId);
  if (currentAcceptance.lastAcceptedVersion === currentAcceptance.latestTosVersion) {
    logger.debug(
      `Latest version of app developer TOS is ${currentAcceptance.lastAcceptedVersion}, already accepted.`
    );
    return currentAcceptance;
  } else {
    // Display link to TOS, prompt for acceptance
    const tosLink = extensionsTosUrl("appdev");
    logger.info(
      `To continue, you must accept the [Extensions app developer terms of service](${tosLink})`
    );
    if (
      await confirm({
        ...options,
        message: "Do you accept the Extensions app developer terms of service?",
      })
    ) {
      return acceptAppDeveloperTOS(projectId, instanceId, currentAcceptance.latestTosVersion);
    }
    throw new FirebaseError("Command terminated becuase app developer TOS was not accepted");
  }
}
