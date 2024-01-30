import * as clc from "colorette";
import { marked } from "marked";
import * as semver from "semver";
import * as TerminalRenderer from "marked-terminal";
import * as path from "path";

import * as refs from "../extensions/refs";
import { logger } from "../logger";
import {
  Api,
  ExtensionSpec,
  ExtensionVersion,
  LifecycleEvent,
  ExternalService,
  Role,
  Param,
  Resource,
  FUNCTIONS_RESOURCE_TYPE,
  EventDescriptor,
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
export async function displayExtensionVersionInfo(args: {
  spec: ExtensionSpec;
  extensionVersion?: ExtensionVersion;
  latestApprovedVersion?: string;
  latestVersion?: string;
}): Promise<string[]> {
  const { spec, extensionVersion, latestApprovedVersion, latestVersion } = args;
  const lines: string[] = [];
  const extensionRef = extensionVersion
    ? refs.toExtensionRef(refs.parse(extensionVersion?.ref))
    : "";
  lines.push(
    `${clc.bold("Extension:")} ${spec.displayName ?? "Unnamed extension"} ${
      extensionRef ? `(${extensionRef})` : ""
    }`,
  );
  if (spec.description) {
    lines.push(`${clc.bold("Description:")} ${spec.description}`);
  }
  let versionNote = "";
  const latestRelevantVersion = latestApprovedVersion || latestVersion;
  if (latestRelevantVersion && semver.eq(spec.version, latestRelevantVersion)) {
    versionNote = `- ${clc.green("Latest")}`;
  }
  if (extensionVersion?.state === "DEPRECATED") {
    versionNote = `- ${clc.red("Deprecated")}`;
  }
  lines.push(`${clc.bold("Version:")} ${spec.version} ${versionNote}`);
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
    }
    lines.push(`${clc.bold("Review status:")} ${reviewStatus}`);
    if (latestApprovedVersion) {
      lines.push(
        `${clc.bold("View in Extensions Hub:")} https://extensions.dev/extensions/${extensionRef}`,
      );
    }
    if (extensionVersion.buildSourceUri) {
      const buildSourceUri = new URL(extensionVersion.buildSourceUri!);
      buildSourceUri.pathname = path.join(
        buildSourceUri.pathname,
        extensionVersion.extensionRoot ?? "",
      );
      lines.push(`${clc.bold("Source in GitHub:")} ${buildSourceUri}`);
    } else {
      lines.push(
        `${clc.bold("Source download URI:")} ${extensionVersion.sourceDownloadUri ?? "-"}`,
      );
    }
  }
  lines.push(`${clc.bold("License:")} ${spec.license ?? "-"}`);
  lines.push(displayResources(spec));
  if (spec.events?.length) {
    lines.push(displayEvents(spec));
  }
  if (spec.externalServices?.length) {
    lines.push(displayExternalServices(spec));
  }
  const apis = impliedApis(spec);
  if (apis.length) {
    lines.push(displayApis(apis));
  }
  const roles = impliedRoles(spec);
  if (roles.length) {
    lines.push(await displayRoles(roles));
  }
  logger.info(`\n${lines.join("\n")}`);
  return lines;
}

export function displayExternalServices(spec: ExtensionSpec) {
  const lines =
    spec.externalServices?.map((service: ExternalService) => {
      return `  - ${clc.cyan(`${service.name} (${service.pricingUri})`)}`;
    }) ?? [];
  return clc.bold("External services used:\n") + lines.join("\n");
}

export function displayEvents(spec: ExtensionSpec) {
  const lines =
    spec.events?.map((event: EventDescriptor) => {
      return `  - ${clc.magenta(event.type)}${event.description ? `: ${event.description}` : ""}`;
    }) ?? [];
  return clc.bold("Events emitted:\n") + lines.join("\n");
}

export function displayResources(spec: ExtensionSpec) {
  const lines = spec.resources.map((resource: Resource) => {
    let type: string = resource.type;
    switch (resource.type) {
      case "firebaseextensions.v1beta.function":
        type = "Cloud Function (1st gen)";
        break;
      case "firebaseextensions.v1beta.v2function":
        type = "Cloud Function (2nd gen)";
        break;
      default:
    }
    return `  - ${clc.blue(`${resource.name} (${type})`)}${
      resource.description ? `: ${resource.description}` : ""
    }`;
  });
  lines.push(
    ...new Set(
      spec.lifecycleEvents?.map((event: LifecycleEvent) => {
        return `  - ${clc.blue(`${event.taskQueueTriggerFunction} (Cloud Task queue)`)}`;
      }),
    ),
  );
  lines.push(
    ...spec.params
      .filter((param: Param) => {
        return param.type === "SECRET";
      })
      .map((param: Param) => {
        return `  - ${clc.blue(`${param.param} (Cloud Secret Manager secret)`)}`;
      }),
  );
  return clc.bold("Resources created:\n") + (lines.length ? lines.join("\n") : " - None");
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
  return `  - ${clc.yellow(res.title!)}${res.description ? `: ${res.description}` : ""}`;
}

async function displayRoles(roles: Role[]): Promise<string> {
  const lines: string[] = await Promise.all(
    roles.map((role: Role) => {
      return retrieveRoleInfo(role.role);
    }),
  );
  return clc.bold("Roles granted:\n") + lines.join("\n");
}

function displayApis(apis: Api[]): string {
  const lines: string[] = apis.map((api: Api) => {
    return `  - ${clc.cyan(api.apiName!)}: ${api.reason}`;
  });
  return clc.bold("APIs used:\n") + lines.join("\n");
}

function usesTasks(spec: ExtensionSpec): boolean {
  return spec.resources.some(
    (r: Resource) =>
      r.type === FUNCTIONS_RESOURCE_TYPE && r.properties?.taskQueueTrigger !== undefined,
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
