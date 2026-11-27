import * as semver from "semver";

import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { isLocalOrURLPath } from "./extensionsHelper";

/**
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param extRef Extension reference
 * @param params Actual fields to update
 */

export interface UpdateOptions {
  projectId: string;
  instanceId: string;
  extRef?: string;
  params?: { [key: string]: string };
  systemParams?: { [key: string]: string };
  canEmitEvents: boolean;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
}

/**
 * Performs all the work to fully update an extension instance
 * Checks if billing is required,
 * adds any newly required roles from the associated service account,
 * removes any roles that are no longer needed,
 * and finally updates the instance
 * @param updateOptions Info on the instance and associated resources to update
 */
export async function update(updateOptions: UpdateOptions): Promise<any> {
  const {
    projectId,
    instanceId,
    extRef,
    params,
    systemParams,
    canEmitEvents,
    allowedEventTypes,
    eventarcChannel,
  } = updateOptions;
  if (extRef) {
    return await extensionsApi.updateInstanceFromRegistry({
      projectId,
      instanceId,
      extRef,
      params,
      systemParams,
      canEmitEvents,
      allowedEventTypes,
      eventarcChannel,
    });
  }
  throw new FirebaseError(
    `A version of the extension was not supplied for ${instanceId}. Please make sure this is a valid extension and try again.`,
  );
}

export function inferUpdateSource(updateSource: string, existingRef: string): string {
  if (!updateSource) {
    return `${existingRef}@latest`;
  }
  if (semver.valid(updateSource)) {
    return `${existingRef}@${updateSource}`;
  }
  if (!isLocalOrURLPath(updateSource) && updateSource.split("/").length < 2) {
    return updateSource.includes("@")
      ? `firebase/${updateSource}`
      : `firebase/${updateSource}@latest`;
  }
  if (!isLocalOrURLPath(updateSource) && !updateSource.includes("@")) {
    return `${updateSource}@latest`;
  }
  return updateSource;
}
