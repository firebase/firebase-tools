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
  urlRegex,
  isLocalOrURLPath,
} from "./extensionsHelper";
import * as utils from "../utils";
import {
  displayUpdateChangesNoInput,
  displayUpdateChangesRequiringConfirmation,
  getConsent,
  displayExtInfo,
} from "./displayExtensionInfo";

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
  if (instance && instance.config.extensionRef) {
    return SourceOrigin.PUBLISHED_EXTENSION;
  }
  // TODO: Deprecate this once official extensions are fully using the Registry.
  // This logic will try to resolve the source with the Registry File. This allows us to use the old update flow
  // of official => officical extensions, if the extension_ref is not filled out.
  // After the migration is complete, all instances will have extension_ref filled out (except instances of local/URL sources).
  // Once that we happens, we can deprecate this whole try-catch block and assume it is a url/local source.
  let existingSourceOrigin: SourceOrigin;
  try {
    const registryEntry = await resolveSource.resolveRegistryEntry(extensionName);
    if (resolveSource.isOfficialSource(registryEntry, existingSource)) {
      existingSourceOrigin = SourceOrigin.OFFICIAL_EXTENSION;
    } else {
      existingSourceOrigin = SourceOrigin.LOCAL;
    }
  } catch {
    existingSourceOrigin = SourceOrigin.LOCAL;
  }
  return existingSourceOrigin;
}

async function showUpdateVersionInfo(
  instanceId: string,
  from: string,
  to: string,
  source?: string
): Promise<void> {
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
    utils.logLabeledBullet(
      logPrefix,
      "The version you are updating to is less than the current version for this extension. This extension may not be backwards compatible."
    );
    return await getConsent("version", "Do you wish to continue?");
  }
  return;
}

/**
 * Prints out warning messages and requires user to consent before continuing with update.
 * @param sourceOrigin source origin
 */
export async function warningUpdateToOtherSource(sourceOrigin: SourceOrigin): Promise<void> {
  let targetText;
  if (
    [
      SourceOrigin.PUBLISHED_EXTENSION,
      SourceOrigin.PUBLISHED_EXTENSION_VERSION,
      SourceOrigin.OFFICIAL_EXTENSION,
      SourceOrigin.OFFICIAL_EXTENSION_VERSION,
    ].includes(sourceOrigin)
  ) {
    targetText = "published extension";
  } else if (sourceOrigin === SourceOrigin.LOCAL) {
    targetText = "local directory";
  } else if (sourceOrigin === SourceOrigin.URL) {
    targetText = "URL";
  }
  const warning = `All the instance's resources and logic will be overwritten to use the source code and files from the ${targetText}.\n`;
  logger.info(marked(warning));
  const continueUpdate = await promptOnce({
    type: "confirm",
    message: "Do you wish to continue with this update?",
    default: false,
  });
  if (!continueUpdate) {
    throw new FirebaseError(`Update cancelled.`, { exit: 2 });
  }
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
export async function displayChanges(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec,
  isOfficial = true
): Promise<void> {
  logger.info(
    "This update contains the following changes (in green and red). " +
      "If at any point you choose not to continue, the extension will not be updated and the changes will be discarded:\n"
  );
  displayUpdateChangesNoInput(spec, newSpec, isOfficial);
  await displayUpdateChangesRequiringConfirmation(spec, newSpec);
}

/**
 * Prompts the user to confirm before continuing to update.
 */
export async function retryUpdate(): Promise<boolean> {
  return promptOnce({
    type: "confirm",
    message: "Are you sure you wish to continue with updating anyways?",
    default: false,
  });
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
 * @param existingSource name of existing instance source
 */
export async function updateFromLocalSource(
  projectId: string,
  instanceId: string,
  localSource: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
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
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, localSource);
  await warningUpdateToOtherSource(SourceOrigin.LOCAL);
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
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
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
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, urlSource);
  await warningUpdateToOtherSource(SourceOrigin.URL);
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
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  let source;
  const refObj = extensionsApi.parseRef(extVersionRef);
  const version = refObj.version;
  displayExtInfo(instanceId, refObj.publisherId, existingSpec, true);
  const extension = await extensionsApi.getExtension(`${refObj.publisherId}/${refObj.extensionId}`);
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
  let sourceOrigin;
  try {
    // Double check that both publisher and extension ID match
    // If the publisher and extension ID both match, we know it's an official extension (i.e. it's specifically listed in our Registry File)
    // Otherwise, it's simply a published extension in the Registry
    registryEntry = await resolveSource.resolveRegistryEntry(existingSpec.name);
    sourceOrigin =
      registryEntry.publisher === refObj.publisherId
        ? SourceOrigin.OFFICIAL_EXTENSION
        : SourceOrigin.PUBLISHED_EXTENSION;
  } catch (err) {
    sourceOrigin = SourceOrigin.PUBLISHED_EXTENSION;
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold(`You are updating this extension instance to a(n) ${sourceOrigin}.`)}`
  );
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
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, extVersionRef);
  await warningUpdateToOtherSource(SourceOrigin.PUBLISHED_EXTENSION);
  if (registryEntry) {
    await resolveSource.promptForUpdateWarnings(
      registryEntry,
      existingSpec.version,
      source.spec.version
    );
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
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  return updateToVersionFromPublisherSource(
    projectId,
    instanceId,
    `${extRef}@latest`,
    existingSpec,
    existingSource
  );
}

/**
 * Preparatory work for updating an published extension instance to the given version.
 *
 * @param instanceId Id of the instance to update
 * @param existingSpec ExtensionSpec of the existing instance source
 * @param existingSource name of existing instance source
 * @param version Version to update the instance to
 */
export async function updateToVersionFromRegistryFile(
  projectId: string,
  instanceId: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string,
  version: string
): Promise<string> {
  if (version !== "latest" && !semver.valid(version)) {
    throw new FirebaseError(`cannot update to invalid version ${version}`);
  }
  // Updating to a version from an published source
  let registryEntry;
  try {
    registryEntry = await resolveSource.resolveRegistryEntry(existingSpec.name);
  } catch (err) {
    // If registry entry does not exist, assume existing source was from local directory or URL.
    throw new FirebaseError(
      `Cannot find the latest version of this extension. To update this instance to a local source or URL source, run "firebase ext:update ${instanceId} <localSourceOrURL>".`
    );
  }
  displayExtInfo(instanceId, registryEntry.publisher, existingSpec, true);
  utils.logLabeledBullet(
    logPrefix,
    clc.bold("You are updating this extension instance to an official source.")
  );

  // Do not allow user to "downgrade" to a version lower than the minimum required version.
  const minVer = resolveSource.getMinRequiredVersion(registryEntry);
  if (minVer) {
    if (version !== "latest" && semver.gt(minVer, version)) {
      throw new FirebaseError(
        `The version you are trying to upgrade to (${clc.bold(
          version
        )}) is less than the minimum version required (${clc.bold(minVer)}) to use this extension.`
      );
    }
  }
  const targetVersion = resolveSource.getTargetVersion(registryEntry, version);
  await showUpdateVersionInfo(instanceId, existingSpec.version, targetVersion);
  await warningUpdateToOtherSource(SourceOrigin.OFFICIAL_EXTENSION);
  await resolveSource.promptForUpdateWarnings(registryEntry, existingSpec.version, targetVersion);
  return resolveSource.resolveSourceUrl(registryEntry, existingSpec.name, targetVersion);
}

/**
 * Preparatory work for updating an published extension instance to the latest version.
 *
 * @param instanceId Id of the instance to update
 * @param existingSpec ExtensionSpec of the existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateFromRegistryFile(
  projectId: string,
  instanceId: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  return updateToVersionFromRegistryFile(
    projectId,
    instanceId,
    existingSpec,
    existingSource,
    "latest"
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
