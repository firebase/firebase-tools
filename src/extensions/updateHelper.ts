import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");

import * as checkProjectBilling from "./checkProjectBilling";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as rolesHelper from "./rolesHelper";
import * as modsApi from "./modsApi";
import { promptOnce } from "../prompt";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const addition = clc.green;
const deletion = clc.red;

/**
 * Prints out all changes to the spec that don't require explicit approval or input
 *
 * @param spec The current spec of a ModInstance
 * @param newSpec The spec that the ModInstance is being updated to
 */
export function displayChangesNoInput(spec: modsApi.ModSpec, newSpec: modsApi.ModSpec): string[] {
  const lines: string[] = [];
  if (spec.version !== newSpec.version) {
    lines.push("", "**Version:**", `- ${spec.version}`, `+ ${newSpec.version}`);
  }
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
 * @param spec The current spec of a ModInstance
 * @param newSpec The spec that the ModInstance is being updated to
 */
export async function displayChangesRequiringConfirmation(
  spec: modsApi.ModSpec,
  newSpec: modsApi.ModSpec
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
    _.isEqual
  );
  const resourcesDiffAdditions = _.differenceWith(
    newSpec.resources,
    _.get(spec, "resources", []),
    _.isEqual
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

function getResourceReadableName(resource: modsApi.Resource): string {
  return resource.type === "function"
    ? `${resource.name} (${resource.description})\n`
    : `${resource.name} (${resource.type})\n`;
}

async function getConsent(field: string, message: string): Promise<void> {
  const consent = await promptOnce({
    type: "confirm",
    message,
    default: false,
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
 * @param spec A current modSpec
 * @param newSpec A modSpec to compare to
 */
export async function displayChanges(
  spec: modsApi.ModSpec,
  newSpec: modsApi.ModSpec
): Promise<void> {
  logger.info(
    "This update contains the following changes. " +
      "If at any point you choose not to continue, the extension will not be updated and the changes will be discarded:"
  );
  displayChangesNoInput(spec, newSpec);
  await displayChangesRequiringConfirmation(spec, newSpec);
}

/**
 * @param projectId Id of the project containing the instance to update
 * @param instanceId Id of the instance to update
 * @param source A ModSource to update to
 * @param params A new set of params to set on the instance
 * @param rolesToAdd A list of roles to grant to the associated service account
 * @param rolesToRemove A list of roles to remove from the associated service account
 * @param serviceAccountEmail The service account used by this mod instance
 * @param billingRequired Whether the mod requires billing
 */

export interface UpdateOptions {
  projectId: string;
  instanceId: string;
  source: modsApi.ModSource;
  params: { [key: string]: string };
  rolesToAdd: modsApi.Role[];
  rolesToRemove: modsApi.Role[];
  serviceAccountEmail: string;
  billingRequired?: boolean;
}

/**
 * Performs all the work to fully update a modInstance
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
  return await modsApi.updateInstance(projectId, instanceId, source, params);
}
