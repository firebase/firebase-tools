import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");
import * as semver from "semver";

import * as checkProjectBilling from "./checkProjectBilling";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as resolveSource from "./resolveSource";
import * as rolesHelper from "./rolesHelper";
import * as extensionsApi from "./extensionsApi";
import { promptOnce } from "../prompt";
import { createSourceFromLocation, logPrefix, SourceOrigin } from "./extensionsHelper";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const addition = clc.green;
const deletion = clc.red;

function invalidSourceErrMsgTemplate(instanceId: string, source: string): string {
  return `Unable to update from the source \`${clc.bold(
    source
  )}\`. To update this instance, you can either:\n
  - Run \`${clc.bold("firebase ext:update " + instanceId)}\` to update from the published source.\n
  - Check your directory path or URL, then run \`${clc.bold(
    "firebase ext:update " + instanceId + " <otherSource>"
  )}\` to update from a local directory or URL source.`;
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
 * @param extensionName name of the extension being updated
 * @param existingSource current source of the extension instance
 * @param nextSourceOrigin new source of the extension instance (to be updated to)
 * @param warning source origin specific warning message
 * @param additionalMsg any additional warnings associated with this update
 */
export async function warningUpdateToOtherSource(
  extensionName: string,
  existingSource: string,
  warning: string,
  nextSourceOrigin: SourceOrigin,
  additionalMsg?: string
): Promise<void> {
  let existingSourceOrigin: SourceOrigin;
  try {
    const registryEntry = await resolveSource.resolveRegistryEntry(extensionName);
    if (resolveSource.isOfficialSource(registryEntry, existingSource)) {
      existingSourceOrigin = SourceOrigin.OFFICIAL;
    } else {
      existingSourceOrigin = SourceOrigin.PUBLISHED_EXTENSION;
    }
  } catch {
    // If registry entry does not exist, assume existing source was from local directory or URL.
    existingSourceOrigin = SourceOrigin.LOCAL;
  }

  // We only allow the following types of updates.
  if (
    !(
      (existingSourceOrigin === SourceOrigin.OFFICIAL && nextSourceOrigin === SourceOrigin.LOCAL) ||
      (existingSourceOrigin === SourceOrigin.OFFICIAL && nextSourceOrigin === SourceOrigin.URL) ||
      // When checking existing Extension source origins, we don't differentiate between LOCAL and URL sources (see above).
      (existingSourceOrigin === SourceOrigin.LOCAL && nextSourceOrigin === SourceOrigin.URL) ||
      existingSourceOrigin === nextSourceOrigin
    )
  ) {
    throw new FirebaseError(
      `Cannot update from a(n) ${existingSourceOrigin} to a(n) ${nextSourceOrigin}. Please provide a new source that is a(n) ${existingSourceOrigin} and try again.`
    );
  }

  let msg = warning;
  if (nextSourceOrigin === SourceOrigin.LOCAL || nextSourceOrigin === SourceOrigin.URL) {
    msg +=
      "\nUpdating this extension instance to an unpublished extension source will upload the unpublished extension source " +
      "to the registry of community extensions, but it must be published before it can be seen by others.\n";
  }

  if (existingSourceOrigin !== nextSourceOrigin) {
    msg +=
      `\nThe current source for this instance is a(n) ${existingSourceOrigin}. The new source for this instance will be a(n) ${nextSourceOrigin}.\n` +
      `${additionalMsg || ""}`;
  }
  const updateWarning = {
    from: existingSourceOrigin,
    description: msg,
  };
  return await resolveSource.confirmUpdateWarning(updateWarning);
}

/**
 * Prints out all changes to the spec that don't require explicit approval or input
 *
 * @param spec The current spec of a ExtensionInstance
 * @param newSpec The spec that the ExtensionInstance is being updated to
 */
export function displayChangesNoInput(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec
): string[] {
  const lines: string[] = [];
  if (spec.displayName !== newSpec.displayName) {
    lines.push(
      "",
      "**Display Name:**",
      deletion(`- ${spec.displayName}`),
      addition(`+ ${newSpec.displayName}`)
    );
  }
  if (spec.description !== newSpec.description) {
    lines.push(
      "",
      "**Description:**",
      deletion(`- ${spec.description}`),
      addition(`+ ${newSpec.description}`)
    );
  }

  if (spec.billingRequired && !newSpec.billingRequired) {
    lines.push("", "**Billing is no longer required for this extension.**");
  }
  logger.info(marked(lines.join("\n")));
  return lines;
}

/**
 * Checks for spec changes that require explicit user consent,
 * and individually prompts the user for each changed field
 *
 * @param spec The current spec of a ExtensionInstance
 * @param newSpec The spec that the ExtensionInstance is being updated to
 */
export async function displayChangesRequiringConfirmation(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec
): Promise<void> {
  if (spec.license !== newSpec.license) {
    const message =
      "\n" +
      "**License**\n" +
      deletion(spec.license ? `- ${spec.license}\n` : "- None\n") +
      addition(newSpec.license ? `+ ${newSpec.license}\n` : "+ None\n") +
      "Do you wish to continue?";
    await getConsent("license", marked(message));
  }

  const apisDiffDeletions = _.differenceWith(spec.apis, _.get(newSpec, "apis", []), _.isEqual);
  const apisDiffAdditions = _.differenceWith(newSpec.apis, _.get(spec, "apis", []), _.isEqual);
  if (apisDiffDeletions.length || apisDiffAdditions.length) {
    let message = "\n**APIs:**\n";
    apisDiffDeletions.forEach((api) => {
      message += deletion(`- ${api.apiName} (${api.reason})\n`);
    });
    apisDiffAdditions.forEach((api) => {
      message += addition(`+ ${api.apiName} (${api.reason})\n`);
    });
    message += "Do you wish to continue?";
    await getConsent("apis", marked(message));
  }

  const resourcesDiffDeletions = _.differenceWith(
    spec.resources,
    _.get(newSpec, "resources", []),
    compareResources
  );
  const resourcesDiffAdditions = _.differenceWith(
    newSpec.resources,
    _.get(spec, "resources", []),
    compareResources
  );
  if (resourcesDiffDeletions.length || resourcesDiffAdditions.length) {
    let message = "\n**Resources:**\n";
    resourcesDiffDeletions.forEach((resource) => {
      message += deletion(` - ${getResourceReadableName(resource)}`);
    });
    resourcesDiffAdditions.forEach((resource) => {
      message += addition(`+ ${getResourceReadableName(resource)}`);
    });
    message += "Do you wish to continue?";
    await getConsent("resources", marked(message));
  }

  const rolesDiffDeletions = _.differenceWith(spec.roles, _.get(newSpec, "roles", []), _.isEqual);
  const rolesDiffAdditions = _.differenceWith(newSpec.roles, _.get(spec, "roles", []), _.isEqual);
  if (rolesDiffDeletions.length || rolesDiffAdditions.length) {
    let message = "\n**Permissions:**\n";
    rolesDiffDeletions.forEach((role) => {
      message += deletion(`- ${role.role} (${role.reason})\n`);
    });
    rolesDiffAdditions.forEach((role) => {
      message += addition(`+ ${role.role} (${role.reason})\n`);
    });
    message += "Do you wish to continue?";
    await getConsent("apis", marked(message));
  }

  if (!spec.billingRequired && newSpec.billingRequired) {
    await getConsent(
      "billingRequired",
      "Billing is now required for the new version of this extension. Would you like to continue?"
    );
  }
}

function compareResources(resource1: extensionsApi.Resource, resource2: extensionsApi.Resource) {
  return resource1.name == resource2.name && resource1.type == resource2.type;
}

function getResourceReadableName(resource: extensionsApi.Resource): string {
  return resource.type === "firebaseextensions.v1beta.function"
    ? `${resource.name} (Cloud Function): ${resource.description}\n`
    : `${resource.name} (${resource.type})\n`;
}

async function getConsent(field: string, message: string): Promise<void> {
  const consent = await promptOnce({
    type: "confirm",
    message,
    default: true,
  });
  if (!consent) {
    throw new FirebaseError(
      `Without explicit consent for the change to ${field}, we cannot update this extension instance.`,
      { exit: 2 }
    );
  }
}

/**
 * Displays all differences between spec and newSpec.
 * First, displays all changes that do not require explicit confirmation,
 * then prompts the user for each change that requires confirmation.
 *
 * @param spec A current extensionSpec
 * @param newSpec A extensionSpec to compare to
 */
export async function displayChanges(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec
): Promise<void> {
  logger.info(
    "This update contains the following changes. " +
      "If at any point you choose not to continue, the extension will not be updated and the changes will be discarded:"
  );
  displayChangesNoInput(spec, newSpec);
  await displayChangesRequiringConfirmation(spec, newSpec);
}

/**
 * Prompts the user to confirm before continuing to update.
 */
export async function retryUpdate(): Promise<boolean> {
  return promptOnce({
    type: "confirm",
    message: "Are you sure you want to continue with updating anyways?",
    default: false,
  });
}

/**
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param source A ExtensionSource to update to
 * @param params A new set of params to set on the instance
 * @param rolesToAdd A list of roles to grant to the associated service account
 * @param rolesToRemove A list of roles to remove from the associated service account
 * @param serviceAccountEmail The service account used by this extension instance
 * @param billingRequired Whether the extension requires billing
 */

export interface UpdateOptions {
  projectId: string;
  instanceId: string;
  source?: extensionsApi.ExtensionSource;
  extRef?: string;
  params?: { [key: string]: string };
  rolesToAdd: extensionsApi.Role[];
  rolesToRemove: extensionsApi.Role[];
  serviceAccountEmail: string;
  billingRequired?: boolean;
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
    rolesToAdd,
    rolesToRemove,
    serviceAccountEmail,
    billingRequired,
  } = updateOptions;
  await checkProjectBilling(projectId, instanceId, billingRequired);
  await rolesHelper.grantRoles(
    projectId,
    serviceAccountEmail,
    rolesToAdd.map((role) => role.role),
    rolesToRemove.map((role) => role.role)
  );
  if (source) {
    return await extensionsApi.updateInstance(projectId, instanceId, source, params);
  } else if (extRef) {
    return await extensionsApi.updateInstanceFromRegistry(projectId, instanceId, extRef, params);
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
  let source;
  try {
    source = await createSourceFromLocation(projectId, localSource);
  } catch (err) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, localSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance from a local source.")}`
  );
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, localSource);
  const warning =
    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the local directory.";
  const additionalMsg =
    "After updating from a local source, this instance cannot be updated in the future to use an official source.";
  await module.exports.warningUpdateToOtherSource(
    existingSpec.name,
    existingSource,
    warning,
    SourceOrigin.LOCAL,
    additionalMsg
  );
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
  let source;
  try {
    source = await createSourceFromLocation(projectId, urlSource);
  } catch (err) {
    throw new FirebaseError(invalidSourceErrMsgTemplate(instanceId, urlSource));
  }
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold("You are updating this extension instance from a URL source.")}`
  );
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, urlSource);
  const warning =
    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the URL.";
  const additionalMsg =
    "After updating from a URL source, this instance cannot be updated in the future to use an official source.";
  await module.exports.warningUpdateToOtherSource(
    existingSpec.name,
    existingSource,
    warning,
    SourceOrigin.URL,
    additionalMsg
  );
  return source.name;
}

/**
 * @param instanceId Id of the instance to update
 * @param extRef extension reference of extension source to update to (publisherId/extensionId@versionId)
 * @param existingSpec ExtensionSpec of existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateToVersionFromPublisherSource(
  instanceId: string,
  extRef: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  const source = await extensionsApi.getExtensionVersion(extRef);
  const { publisherId, extensionId } = extensionsApi.parseRef(extRef);
  utils.logLabeledBullet(
    logPrefix,
    `${clc.bold(
      `You are updating this extension instance to '${extensionId}' published by '${publisherId}'.`
    )}`
  );
  await showUpdateVersionInfo(instanceId, existingSpec.version, source.spec.version, extRef);
  const warning =
    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the published extension.";
  await module.exports.warningUpdateToOtherSource(
    existingSpec.name,
    existingSource,
    warning,
    SourceOrigin.PUBLISHED_EXTENSION
  );
  return source.name;
}

/**
 * @param instanceId Id of the instance to update
 * @param extRef extension reference of extension source to update to (publisherId/extensionId)
 * @param existingSpec ExtensionSpec of existing instance source
 * @param existingSource name of existing instance source
 */
export async function updateFromPublisherSource(
  instanceId: string,
  extRef: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  return updateToVersionFromPublisherSource(
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
export async function updateToVersionFromRegistry(
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

  const warning =
    "All the instance's extension-specific resources and logic will be overwritten to use the source code and files from the latest released version.\n";
  await module.exports.warningUpdateToOtherSource(
    existingSpec.name,
    existingSource,
    warning,
    SourceOrigin.OFFICIAL
  );
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
export async function updateFromRegistry(
  instanceId: string,
  existingSpec: extensionsApi.ExtensionSpec,
  existingSource: string
): Promise<string> {
  return updateToVersionFromRegistry(instanceId, existingSpec, existingSource, "latest");
}
