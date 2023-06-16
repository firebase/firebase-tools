import * as clc from "colorette";
import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";
import * as path from "path";

import * as refs from "../extensions/refs";
import { logger } from "../logger";
import {
  Api,
  ExtensionSpec,
  ExtensionVersion,
  Role,
  Resource,
  FUNCTIONS_RESOURCE_TYPE,
} from "./types";
import * as iam from "../gcp/iam";
import { SECRET_ROLE, usesSecrets } from "./secretsUtils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

const TASKS_ROLE = "cloudtasks.enqueuer";
const TASKS_API = "cloudtasks.googleapis.com";

/**
 * Displays info about an extension version, whether it is uploaded to the registry or a local spec.
 *
 * @param spec the extension spec
 * @param extensionVersion the extension version
 * */
export async function displayExtensionVersionInfo(
  spec: ExtensionSpec,
  extensionVersion?: ExtensionVersion
): Promise<string[]> {
  const lines: string[] = [];
  lines.push(
    `${clc.bold("Extension:")} ${spec.displayName ?? "Unnamed extension"} ${
      extensionVersion ? `(${refs.toExtensionRef(refs.parse(extensionVersion.ref))})` : ""
    }`
  );
  if (spec.description) {
    lines.push(`${clc.bold("Description")} ${spec.description}`);
  }
  lines.push(
    `${clc.bold("Version:")} ${spec.version} ${
      extensionVersion?.state === "DEPRECATED" ? `(${clc.red("Deprecated")})` : ""
    }`
  );
  if (extensionVersion) {
    let reviewStatus: string;
    switch (extensionVersion.listing?.state) {
      case "APPROVED":
        reviewStatus = clc.bold(clc.green("Accepted"));
        break;
      case "REJECTED":
        reviewStatus = clc.bold(clc.red("Rejected"));
        break;
      default:
        reviewStatus = clc.bold(clc.yellow("Unreviewed"));
        break;
    }
    lines.push(`${clc.bold("Review status:")} ${reviewStatus}`);
    if (extensionVersion.buildSourceUri) {
      const buildSourceUri = new URL(extensionVersion.buildSourceUri!);
      buildSourceUri.pathname = path.join(
        buildSourceUri.pathname,
        extensionVersion.extensionRoot ?? ""
      );
      lines.push(`${clc.bold("Source in GitHub:")} ${buildSourceUri}`);
    } else {
      lines.push(
        `${clc.bold("Source download URI:")} ${extensionVersion.sourceDownloadUri ?? "-"}`
      );
    }
  }
  lines.push(`${clc.bold("License:")} ${spec.license ?? "-"}`);
  const apis = impliedApis(spec);
  if (apis.length) {
    lines.push(displayApis(apis));
  }
  const roles = impliedRoles(spec);
  if (roles.length) {
    lines.push(await displayRoles(roles));
  }
  logger.info(`\n${lines.join("\n")}\n`);
  return lines;
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
  return ` - ${clc.yellow(res.title!)}: ${res.description}`;
}

async function displayRoles(roles: Role[]): Promise<string> {
  const lines: string[] = await Promise.all(
    roles.map((role: Role) => {
      return retrieveRoleInfo(role.role);
    })
  );
  return clc.bold("Roles granted to this extension:\n") + lines.join("\n");
}

function displayApis(apis: Api[]): string {
  const lines: string[] = apis.map((api: Api) => {
    return ` - ${clc.yellow(api.apiName!)}: ${api.reason}`;
  });
  return clc.bold("APIs used by this extension:\n") + lines.join("\n");
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
      reason: "Allows the extension to read secret values from Cloud Secret Manager.",
    });
  }
  if (usesTasks(spec) && !spec.roles?.some((r: Role) => r.role === TASKS_ROLE)) {
    roles.push({
      role: TASKS_ROLE,
      reason: "Allows the extension to enqueue Cloud Tasks.",
    });
  }
  return roles.concat(spec.roles ?? []);
}

function impliedApis(spec: ExtensionSpec): Api[] {
  const apis: Api[] = [];
  if (usesTasks(spec) && !spec.apis?.some((a: Api) => a.apiName === TASKS_API)) {
    apis.push({
      apiName: TASKS_API,
      reason: "Allows the extension to enqueue Cloud Tasks.",
    });
  }

  return apis.concat(spec.apis ?? []);
}
