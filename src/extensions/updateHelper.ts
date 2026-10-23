import * as semver from "semver";

import { FirebaseError } from "../error";
import * as extensionsApi from "./extensionsApi";
import { ExtensionSource } from "./types";
import { isLocalOrURLPath } from "./extensionsHelper";

/**
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param extRef Extension reference
 * @param source An ExtensionSource to update to (if extRef is not passed in)
 * @param params Actual fields to update
 */

export interface UpdateOptions {
  projectId: string;
  instanceId: string;
  source?: ExtensionSource;
  extRef?: string;
  params?: { [key: string]: string };
  systemParams?: { [key: string]: string };
  canEmitEvents: boolean;
  allowedEventTypes?: string[];
  eventarcChannel?: string;
}

/**
 * Performs all the work to fully update a extensionInstance
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
    source,
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
  } else if (source) {
    return await extensionsApi.updateInstance({
      projectId,
      instanceId,
      extensionSource: source,
      params,
      systemParams,
      canEmitEvents,
      allowedEventTypes,
      eventarcChannel,
    });
  }
  throw new FirebaseError(
    `Neither a source nor a version of the extension was supplied for ${instanceId}. Please make sure this is a valid extension and try again.`,
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
