import * as clc from "cli-color";
import * as semver from "semver";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as resolveSource from "./resolveSource";
import * as extensionsApi from "./extensionsApi";
import { promptOnce } from "../prompt";
import * as marked from "marked";
import {
  createSourceFromLocation,
  logPrefix,
  SourceOrigin,
  isLocalOrURLPath,
  confirm,
} from "./extensionsHelper";
import * as utils from "../utils";
import {
  displayUpdateChangesNoInput,
  displayUpdateChangesRequiringConfirmation,
  displayExtInfo,
} from "./displayExtensionInfo";
import * as changelog from "./changelog";

function invalidSourceErrMsgTemplate(instanceId: string, source: string): string {
  return `Unable to update from the source \`${clc.bold(
    source
  )}\`. To update this instance, you can either:\n
  - Run \`${clc.bold("firebase ext:update " + instanceId)}\` to update from the published source.\n
  - Check your directory path or URL, then run \`${clc.bold(
    "firebase ext:update " + instanceId + " <otherSource>"
  )}\` to update from a local directory or URL source.`;
}

export async function getExistingSourceOrigin(
  projectId: string,
  instanceId: string,
  extensionName: string,
  existingSource: string
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
  source?: string
): void {
  if (source) {
    source = clc.bold(source);
  } else {
    source = "version";
  }
  utils.logLabeledBullet(
    logPrefix,
    `Updating ${clc.bold(instanceId)} from version ${clc.bold(from)} to ${source} (${clc.bold(to)})`
  );
  if (semver.lt(to, from)) {
    utils.logLabeledWarning(
      logPrefix,
      "The version you are updating to is less than the current version for this extension. This extension may not be backwards compatible."
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
      sourceOrigin
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
 * Displays all differences between spec and newSpec.
 * First, displays all changes that do not require explicit confirmation,
 * then prompts the user for each change that requires confirmation.
 *
 * @param spec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 * @param published
 */
export async function displayChanges(args: {
  spec: extensionsApi.ExtensionSpec;
  newSpec: extensionsApi.ExtensionSpec;
  nonInteractive: boolean;
  force: boolean;
}): Promise<void> {
  utils.logLabeledBullet("extensions", "This update contains the following changes:");
  displayUpdateChangesNoInput(args.spec, args.newSpec);
  await displayUpdateChangesRequiringConfirmation(args);
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
  source?: extensionsApi.ExtensionSource;
  extRef?: string;
  params?: { [key: string]: string };
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
  const { projectId, instanceId, source, extRef, params } = updateOptions;
  if (extRef) {
    return await extensionsApi.updateInstanceFromRegistry(projectId, instanceId, extRef, params);
  } else if (source) {
    return await extensionsApi.updateInstance(projectId, instanceId, source, params);
  }
  throw new FirebaseError(
    `Neither a source nor a version of the extension was supplied for ${instanceId}. Please make sure this is a valid extension and try again.`
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
  existingSpec: extensionsApi.ExtensionSpec
): Promise<string> {
  displayExtInfo(instanceId, "", existingSpec, false);
  let source;
  try {
    source = await createSourceFromLocation(projectId, localSource);
  } catch (err) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, localSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance to a local source.")}`
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
  existingSpec: extensionsApi.ExtensionSpec
): Promise<string> {
  displayExtInfo(instanceId, "", existingSpec, false);
  let source;
  try {
    source = await createSourceFromLocation(projectId, urlSource);
  } catch (err) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, urlSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance to a URL source.")}`
  );
  showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, urlSource);
  warningUpdateToOtherSource(SourceOrigin.URL);
  return source.name;
}

/**
 * @param instanceId Id of the instance to update
 * @param extVersionRef extension reference of extension source to update to (publisherId/extensionId@versionId)
 * @param existingSpec ExtensionSpec of existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateToVersionFromPublisherSource(
  projectId: string,
  instanceId: string,
  extVersionRef: string,
  existingSpec: extensionsApi.ExtensionSpec
): Promise<string> {
  let source;
  const refObj = extensionsApi.parseRef(extVersionRef);
  const version = refObj.version;
  const extensionRef = `${refObj.publisherId}/${refObj.extensionId}`;
  displayExtInfo(instanceId, refObj.publisherId, existingSpec, true);
  const extension = await extensionsApi.getExtension(extensionRef);
  try {
    source = await extensionsApi.getExtensionVersion(extVersionRef);
  } catch (err) {
    throw new FirebaseError(
      `Could not find source '${clc.bold(extVersionRef)}' because (${clc.bold(
        version
      )}) is not a published version. To update, use the latest version of this extension (${clc.bold(
        extension.latestVersion
      )}).`
    );
  }
  let registryEntry;
  try {
    registryEntry = await resolveSource.resolveRegistryEntry(existingSpec.name);
  } catch (err) {
    logger.debug(`Unable to fetch registry.json entry for ${existingSpec.name}`);
  }

  if (registryEntry) {
    // Do not allow user to "downgrade" to a version lower than the minimum required version.
    const minVer = resolveSource.getMinRequiredVersion(registryEntry);
    if (minVer && semver.gt(minVer, source.spec.version)) {
      throw new FirebaseError(
        `The version you are trying to update to (${clc.bold(
          source.spec.version
        )}) is less than the minimum version required (${clc.bold(minVer)}) to use this extension.`
      );
    }
  }
  showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, extVersionRef);
  warningUpdateToOtherSource(SourceOrigin.PUBLISHED_EXTENSION);
  const releaseNotes = await changelog.getReleaseNotesForUpdate({
    extensionRef,
    fromVersion: existingSpec.version,
    toVersion: source.spec.version,
  });
  if (Object.keys(releaseNotes).length) {
    changelog.displayReleaseNotes(releaseNotes, existingSpec.version);
  }
  return source.name;
}

/**
 * @param instanceId Id of the instance to update
 * @param extRef extension reference of extension source to update to (publisherId/extensionId)
 * @param existingSpec ExtensionSpec of existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateFromPublisherSource(
  projectId: string,
  instanceId: string,
  extRef: string,
  existingSpec: extensionsApi.ExtensionSpec
): Promise<string> {
  return updateToVersionFromPublisherSource(
    projectId,
    instanceId,
    `${extRef}@latest`,
    existingSpec
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
