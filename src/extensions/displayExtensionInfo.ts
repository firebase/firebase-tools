import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import * as utils from "../utils";
import { logPrefix } from "./extensionsHelper";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { Api, ExtensionSpec, Role, Resource, FUNCTIONS_RESOURCE_TYPE } from "./types";
import * as iam from "../gcp/iam";
import { SECRET_ROLE, usesSecrets } from "./secretsUtils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const TASKS_ROLE = "cloudtasks.enqueuer";
const TASKS_API = "cloudtasks.googleapis.com";

/**
 * displayExtInfo prints the extension info displayed when running ext:install.
 *
 * @param extensionName name of the extension to display information about
 * @param spec extension spec
 * @param published whether or not the extension is a published extension
 */
export async function displayExtInfo(
  extensionName: string,
  publisher: string,
  spec: ExtensionSpec,
  published = false
): Promise<string[]> {
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
    if (spec.sourceUrl) {
      lines.push(`**Source code**: ${spec.sourceUrl}`);
    }
  }
  const apis = impliedApis(spec);
  if (apis.length) {
    lines.push(displayApis(apis));
  }
  const roles = impliedRoles(spec);
  if (roles.length) {
    lines.push(await displayRoles(roles));
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
 * Prints a clickable link where users can download the source code for an Extension Version.
 */
export function printSourceDownloadLink(sourceDownloadUri: string): void {
  const sourceDownloadMsg = `Want to review the source code that will be installed? Download it here: ${sourceDownloadUri}`;
  utils.logBullet(marked(sourceDownloadMsg));
}

/**
 * Returns a string representing a Role, see
 * https://cloud.google.com/iam/reference/rest/v1/organizations.roles#Role
 * for more details on parameters of a Role.
 * @param role to get info for
 * @return {string} string representation for role
 */
export async function retrieveRoleInfo(role: string) {
  const res = await iam.getRole(role);
  return `  ${res.title} (${res.description})`;
}

async function displayRoles(roles: Role[]): Promise<string> {
  const lines: string[] = await Promise.all(
    roles.map((role: Role) => {
      return retrieveRoleInfo(role.role);
    })
  );
  return clc.bold("**Roles granted to this Extension**:\n") + lines.join("\n");
}

function displayApis(apis: Api[]): string {
  const lines: string[] = apis.map((api: Api) => {
    return `  ${api.apiName} (${api.reason})`;
  });
  return "**APIs used by this Extension**:\n" + lines.join("\n");
}

function usesTasks(spec: ExtensionSpec): boolean {
  return spec.resources.some(
    (r: Resource) =>
      r.type === FUNCTIONS_RESOURCE_TYPE && r.properties?.taskQueueTrigger !== undefined
  );
}

function impliedRoles(spec: ExtensionSpec): Role[] {
  const roles: Role[] = [];
  if (usesSecrets(spec) && !spec.roles?.some((r: Role) => r.role === SECRET_ROLE)) {
    roles.push({
      role: SECRET_ROLE,
      reason: "Allows the extension to read secret values from Cloud Secret Manager",
    });
  }
  if (usesTasks(spec) && !spec.roles?.some((r: Role) => r.role === TASKS_ROLE)) {
    roles.push({
      role: TASKS_ROLE,
      reason: "Allows the extension to enqueue Cloud Tasks",
    });
  }
  return roles.concat(spec.roles ?? []);
}

function impliedApis(spec: ExtensionSpec): Api[] {
  const apis: Api[] = [];
  if (usesTasks(spec) && !spec.apis?.some((a: Api) => a.apiName === TASKS_API)) {
    apis.push({
      apiName: TASKS_API,
      reason: "Allows the extension to enqueue Cloud Tasks",
    });
  }

  return apis.concat(spec.apis ?? []);
}
