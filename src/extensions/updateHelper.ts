import * as clc from "colorette";
import * as semver from "semver";
import { marked } from "marked";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as extensionsApi from "./extensionsApi";
import { ExtensionSource, ExtensionSpec } from "./types";
import {
  createSourceFromLocation,
  logPrefix,
  SourceOrigin,
  isLocalOrURLPath,
} from "./extensionsHelper";
import * as utils from "../utils";
import { displayExtensionVersionInfo } from "./displayExtensionInfo";

function invalidSourceErrMsgTemplate(instanceId: string, source: string): string {
  return `Unable to update from the source \`${clc.bold(
    source,
  )}\`. To update this instance, you can either:\n
  - Run \`${clc.bold("firebase ext:update " + instanceId)}\` to update from the published source.\n
  - Check your directory path or URL, then run \`${clc.bold(
    "firebase ext:update " + instanceId + " <otherSource>",
  )}\` to update from a local directory or URL source.`;
}

export async function getExistingSourceOrigin(
  projectId: string,
  instanceId: string,
): Promise<SourceOrigin> {
  const instance = await extensionsApi.getInstance(projectId, instanceId);
  return instance && instance.config.extensionRef
    ? SourceOrigin.PUBLISHED_EXTENSION
    : SourceOrigin.LOCAL;
}

function showUpdateVersionInfo(
  instanceId: string,
  from: string,
  to: string,
  source?: string,
): void {
  if (source) {
    source = clc.bold(source);
  } else {
    source = "version";
  }
  utils.logLabeledBullet(
    logPrefix,
    `Updating ${clc.bold(instanceId)} from version ${clc.bold(from)} to ${source} (${clc.bold(to)})`,
  );
  if (semver.lt(to, from)) {
    utils.logLabeledWarning(
      logPrefix,
      "The version you are updating to is less than the current version for this extension. This extension may not be backwards compatible.",
    );
  }
  return;
}

/**
 * Prints out informational message about what code the instance will be updated to..
 * @param sourceOrigin source origin
 */
export function warningUpdateToOtherSource(sourceOrigin: SourceOrigin) {
  let targetText;
  if (
    [SourceOrigin.PUBLISHED_EXTENSION, SourceOrigin.PUBLISHED_EXTENSION_VERSION].includes(
      sourceOrigin,
    )
  ) {
    targetText = "published extension";
  } else if (sourceOrigin === SourceOrigin.LOCAL) {
    targetText = "local directory";
  } else if (sourceOrigin === SourceOrigin.URL) {
    targetText = "URL";
  }
  const warning = `All the instance's resources and logic will be overwritten to use the source code and files from the ${targetText}.\n`;
  logger.info(marked(warning));
}

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
      canEmitEvents,
      allowedEventTypes,
      eventarcChannel,
    });
  }
  throw new FirebaseError(
    `Neither a source nor a version of the extension was supplied for ${instanceId}. Please make sure this is a valid extension and try again.`,
  );
}

/**
 * Preparatory work for updating an extension instance to a local source, including ensuring local source is valid.
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param localSource path to the new local source
 * @param existingSpec ExtensionSpec of existing instance source
 */
export async function updateFromLocalSource(
  projectId: string,
  instanceId: string,
  localSource: string,
  existingSpec: ExtensionSpec,
): Promise<string> {
  await displayExtensionVersionInfo({ spec: existingSpec });
  let source;
  try {
    source = await createSourceFromLocation(projectId, localSource);
  } catch (err: any) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, localSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance to a local source.")}`,
  );
  showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, localSource);
  warningUpdateToOtherSource(SourceOrigin.LOCAL);
  return source.name;
}

/**
 * Preparatory work for updating an extension instance to a URL source, including ensuring URL source is valid.
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param urlSource URL of the new source
 * @param existingSpec ExtensionSpec of existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateFromUrlSource(
  projectId: string,
  instanceId: string,
  urlSource: string,
  existingSpec: ExtensionSpec,
): Promise<string> {
  await displayExtensionVersionInfo({ spec: existingSpec });
  let source;
  try {
    source = await createSourceFromLocation(projectId, urlSource);
  } catch (err: any) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, urlSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance to a URL source.")}`,
  );
  showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, urlSource);
  warningUpdateToOtherSource(SourceOrigin.URL);
  return source.name;
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
