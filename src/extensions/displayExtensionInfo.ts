import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");

import * as extensionsApi from "./extensionsApi";
import * as utils from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const additionColor = clc.green;
const deletionColor = clc.red;

/**
 * displayExtInfo prints the extension info displayed when running ext:install.
 *
 * @param extensionName name of the extension to display information about
 * @param spec extension spec
 * @param published whether or not the extension is a published extension
 */
export function displayExtInfo(
  extensionName: string,
  spec: extensionsApi.ExtensionSpec,
  published = false
): string[] {
  const lines = [];
  lines.push(`**Name**: ${spec.displayName}`);
  const url = spec.author?.url;
  const urlMarkdown = url ? `(**[${url}](${url})**)` : "";
  lines.push(`**Author**: ${spec.author?.authorName} ${urlMarkdown}`);
  if (spec.description) {
    lines.push(`**Description**: ${spec.description}`);
  }
  if (published) {
    if (spec.license) {
      lines.push(`**License**: ${spec.license}`);
    }
    lines.push(`**Source code**: ${spec.sourceUrl}`);
  }
  if (lines.length > 0) {
    utils.logLabeledBullet(logPrefix, `information about '${clc.bold(extensionName)}':`);
    const infoStr = lines.join("\n");
    // Convert to markdown and convert any trailing newlines to a single newline.
    const formatted = marked(infoStr).replace(/\n+$/, "\n");
    logger.info(formatted);
    // Return for testing purposes.
    return lines;
  } else {
    throw new FirebaseError(
      "Error occurred during installation: cannot parse info from source spec",
      {
        context: {
          spec: spec,
          extensionName: extensionName,
        },
      }
    );
  }
}

/**
 * Prints out all changes to the spec that don't require explicit approval or input.
 *
 * @param spec The current spec of a ExtensionInstance.
 * @param newSpec The spec that the ExtensionInstance is being updated to
 * @param published whether or not this spec is for a published extension
 */
export function displayUpdateChangesNoInput(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec,
  published = false
): string[] {
  const lines: string[] = [];
  if (spec.displayName !== newSpec.displayName) {
    lines.push(
      "",
      "**Name:**",
      deletionColor(`- ${spec.displayName}`),
      additionColor(`+ ${newSpec.displayName}`)
    );
  }

  if (spec.author?.authorName !== newSpec.author?.authorName) {
    lines.push(
      "",
      "**Author:**",
      deletionColor(`- ${spec.author?.authorName}`),
      additionColor(`+ ${spec.author?.authorName}`)
    );
  }

  if (spec.description !== newSpec.description) {
    lines.push(
      "",
      "**Description:**",
      deletionColor(`- ${spec.description}`),
      additionColor(`+ ${newSpec.description}`)
    );
  }

  if (published) {
    if (spec.sourceUrl !== newSpec.sourceUrl) {
      lines.push(
        "",
        "**Source code:**",
        deletionColor(`- ${spec.sourceUrl}`),
        additionColor(`+ ${newSpec.sourceUrl}`)
      );
    }
  }

  if (spec.billingRequired && !newSpec.billingRequired) {
    lines.push("", "**Billing is no longer required for this extension.**");
  }
  logger.info(marked(lines.join("\n")));
  return lines;
}

/**
 * Checks for spec changes that require explicit user consent,
 * and individually prompts the user for each changed field.
 *
 * @param spec The current spec of a ExtensionInstance
 * @param newSpec The spec that the ExtensionInstance is being updated to
 */
export async function displayUpdateChangesRequiringConfirmation(
  spec: extensionsApi.ExtensionSpec,
  newSpec: extensionsApi.ExtensionSpec
): Promise<void> {
  if (spec.license !== newSpec.license) {
    const message =
      "\n" +
      "**License**\n" +
      deletionColor(spec.license ? `- ${spec.license}\n` : "- None\n") +
      additionColor(newSpec.license ? `+ ${newSpec.license}\n` : "+ None\n") +
      "Do you wish to continue?";
    await getConsent("license", marked(message));
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const apisDiffDeletions = _.differenceWith(spec.apis, _.get(newSpec, "apis", []), _.isEqual);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const apisDiffAdditions = _.differenceWith(newSpec.apis, _.get(spec, "apis", []), _.isEqual);
  if (apisDiffDeletions.length || apisDiffAdditions.length) {
    let message = "\n**APIs:**\n";
    apisDiffDeletions.forEach((api) => {
      message += deletionColor(`- ${api.apiName} (${api.reason})\n`);
    });
    apisDiffAdditions.forEach((api) => {
      message += additionColor(`+ ${api.apiName} (${api.reason})\n`);
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
      message += deletionColor(` - ${getResourceReadableName(resource)}`);
    });
    resourcesDiffAdditions.forEach((resource) => {
      message += additionColor(`+ ${getResourceReadableName(resource)}`);
    });
    message += "Do you wish to continue?";
    await getConsent("resources", marked(message));
  }

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const rolesDiffDeletions = _.differenceWith(spec.roles, _.get(newSpec, "roles", []), _.isEqual);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const rolesDiffAdditions = _.differenceWith(newSpec.roles, _.get(spec, "roles", []), _.isEqual);
  if (rolesDiffDeletions.length || rolesDiffAdditions.length) {
    let message = "\n**Permissions:**\n";
    rolesDiffDeletions.forEach((role) => {
      message += deletionColor(`- ${role.role} (${role.reason})\n`);
    });
    rolesDiffAdditions.forEach((role) => {
      message += additionColor(`+ ${role.role} (${role.reason})\n`);
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

/**
 * Asks the user to provide permission to update the instance.
 * @param field
 * @param message
 */
export async function getConsent(field: string, message: string): Promise<void> {
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
