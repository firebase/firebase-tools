import * as _ from "lodash";
import * as clc from "cli-color";
import * as marked from "marked";
import TerminalRenderer = require("marked-terminal");

import * as extensionsApi from "./extensionsApi";
import * as utils from "../utils";
import { confirm, logPrefix } from "./extensionsHelper";
import { logger } from "../logger";
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
  publisher: string,
  spec: extensionsApi.ExtensionSpec,
  published = false
): string[] {
  const lines = [];
  lines.push(`**Name**: ${spec.displayName}`);
  if (publisher) {
    lines.push(`**Publisher**: ${publisher}`);
  }
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
  newSpec: extensionsApi.ExtensionSpec
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

  if (spec.sourceUrl !== newSpec.sourceUrl) {
    lines.push(
      "",
      "**Source code:**",
      deletionColor(`- ${spec.sourceUrl}`),
      additionColor(`+ ${newSpec.sourceUrl}`)
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
 * and individually prompts the user for each changed field.
 *
 * @param spec The current spec of a ExtensionInstance
 * @param newSpec The spec that the ExtensionInstance is being updated to
 */
export async function displayUpdateChangesRequiringConfirmation(args: {
  spec: extensionsApi.ExtensionSpec;
  newSpec: extensionsApi.ExtensionSpec;
  nonInteractive: boolean;
  force: boolean;
}): Promise<void> {
  const equals = (a: any, b: any) => {
    return _.isEqual(a, b);
  };
  if (args.spec.license !== args.newSpec.license) {
    const message =
      "\n" +
      "**License**\n" +
      deletionColor(args.spec.license ? `- ${args.spec.license}\n` : "- None\n") +
      additionColor(args.newSpec.license ? `+ ${args.newSpec.license}\n` : "+ None\n");
    logger.info(message);
    if (
      !(await confirm({ nonInteractive: args.nonInteractive, force: args.force, default: true }))
    ) {
      throw new FirebaseError(
        "Unable to update this extension instance without explicit consent for the change to 'License'."
      );
    }
  }
  const apisDiffDeletions = _.differenceWith(
    args.spec.apis,
    _.get(args.newSpec, "apis", []),
    equals
  );
  const apisDiffAdditions = _.differenceWith(
    args.newSpec.apis,
    _.get(args.spec, "apis", []),
    equals
  );
  if (apisDiffDeletions.length || apisDiffAdditions.length) {
    let message = "\n**APIs:**\n";
    apisDiffDeletions.forEach((api) => {
      message += deletionColor(`- ${api.apiName} (${api.reason})\n`);
    });
    apisDiffAdditions.forEach((api) => {
      message += additionColor(`+ ${api.apiName} (${api.reason})\n`);
    });
    logger.info(message);
    if (
      !(await confirm({ nonInteractive: args.nonInteractive, force: args.force, default: true }))
    ) {
      throw new FirebaseError(
        "Unable to update this extension instance without explicit consent for the change to 'APIs'."
      );
    }
  }

  const resourcesDiffDeletions = _.differenceWith(
    args.spec.resources,
    _.get(args.newSpec, "resources", []),
    compareResources
  );
  const resourcesDiffAdditions = _.differenceWith(
    args.newSpec.resources,
    _.get(args.spec, "resources", []),
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
    logger.info(message);
    if (
      !(await confirm({ nonInteractive: args.nonInteractive, force: args.force, default: true }))
    ) {
      throw new FirebaseError(
        "Unable to update this extension instance without explicit consent for the change to 'Resources'."
      );
    }
  }

  const rolesDiffDeletions = _.differenceWith(
    args.spec.roles,
    _.get(args.newSpec, "roles", []),
    equals
  );
  const rolesDiffAdditions = _.differenceWith(
    args.newSpec.roles,
    _.get(args.spec, "roles", []),
    equals
  );

  if (rolesDiffDeletions.length || rolesDiffAdditions.length) {
    let message = "\n**Permissions:**\n";
    rolesDiffDeletions.forEach((role) => {
      message += deletionColor(`- ${role.role} (${role.reason})\n`);
    });
    rolesDiffAdditions.forEach((role) => {
      message += additionColor(`+ ${role.role} (${role.reason})\n`);
    });
    logger.info(message);
    if (
      !(await confirm({ nonInteractive: args.nonInteractive, force: args.force, default: true }))
    ) {
      throw new FirebaseError(
        "Unable to update this extension instance without explicit consent for the change to 'Permissions'."
      );
    }
  }

  if (!args.spec.billingRequired && args.newSpec.billingRequired) {
    logger.info("Billing is now required for the new version of this extension.");
    if (
      !(await confirm({ nonInteractive: args.nonInteractive, force: args.force, default: true }))
    ) {
      throw new FirebaseError(
        "Unable to update this extension instance without explicit consent for the change to 'BillingRequired'."
      );
    }
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
 * Prints a clickable link where users can download the source code for an Extension Version.
 */
export function printSourceDownloadLink(sourceDownloadUri: string): void {
  const sourceDownloadMsg = `Want to review the source code that will be installed? Download it here: ${sourceDownloadUri}`;
  utils.logBullet(marked(sourceDownloadMsg));
}
