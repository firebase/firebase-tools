import * as clc from "colorette";
import * as ora from "ora";
import * as semver from "semver";
import * as tmp from "tmp";
import * as fs from "fs-extra";
import fetch from "node-fetch";
import * as path from "path";
import { marked } from "marked";

import { createUnzipTransform } from "./../unzip";
const TerminalRenderer = require("marked-terminal");
marked.setOptions({
  renderer: new TerminalRenderer(),
});

import { storageOrigin } from "../api";
import { archiveDirectory } from "../archiveDirectory";
import { convertOfficialExtensionsToList } from "./utils";
import { getFirebaseConfig } from "../functionsConfig";
import { getProjectAdminSdkConfigOrCached } from "../emulator/adminSdkConfig";
import { getExtensionRegistry } from "./resolveSource";
import { FirebaseError } from "../error";
import { diagnose } from "./diagnose";
import { checkResponse } from "./askUserForParam";
import { ensure } from "../ensureApiEnabled";
import { deleteObject, uploadObject } from "../gcp/storage";
import { getProjectId } from "../projectUtils";
import { createSource, getInstance } from "./extensionsApi";
import {
  createExtensionVersionFromGitHubSource,
  createExtensionVersionFromLocalSource,
  getExtension,
  getExtensionVersion,
  listExtensionVersions,
} from "./publisherApi";
import { Extension, ExtensionSource, ExtensionSpec, ExtensionVersion, Param } from "./types";
import * as refs from "./refs";
import { EXTENSIONS_SPEC_FILE, readFile, getLocalExtensionSpec } from "./localHelper";
import { confirm, promptOnce } from "../prompt";
import { logger } from "../logger";
import { envOverride } from "../utils";
import { getLocalChangelog } from "./change-log";
import { getProjectNumber } from "../getProjectNumber";
import { Constants } from "../emulator/constants";

/**
 * SpecParamType represents the exact strings that the extensions
 * backend expects for each param type in the extensionYaml.
 * This DOES NOT represent the param.type strings that the backend returns in spec.
 * ParamType, defined in extensionsApi.ts, describes the returned strings.
 */
export enum SpecParamType {
  SELECT = "select",
  MULTISELECT = "multiSelect",
  STRING = "string",
  SELECTRESOURCE = "selectResource",
  SECRET = "secret",
}

export enum SourceOrigin {
  OFFICIAL_EXTENSION = "official extension",
  LOCAL = "unpublished extension (local source)",
  PUBLISHED_EXTENSION = "published extension",
  PUBLISHED_EXTENSION_VERSION = "specific version of a published extension",
  URL = "unpublished extension (URL source)",
  OFFICIAL_EXTENSION_VERSION = "specific version of an official extension",
}

export const logPrefix = "extensions";
const VALID_LICENSES = ["apache-2.0"];
// Extension archive URLs must be HTTPS.
export const URL_REGEX = /^https:/;
export const EXTENSIONS_BUCKET_NAME = envOverride(
  "FIREBASE_EXTENSIONS_UPLOAD_BUCKET",
  "firebase-ext-eap-uploads",
);
const AUTOPOPULATED_PARAM_NAMES = [
  "PROJECT_ID",
  "STORAGE_BUCKET",
  "EXT_INSTANCE_ID",
  "DATABASE_INSTANCE",
  "DATABASE_URL",
];
// Placeholders that can be used whever param substitution is needed, but are not available.
export const AUTOPOULATED_PARAM_PLACEHOLDERS = {
  PROJECT_ID: "project-id",
  STORAGE_BUCKET: "project-id.appspot.com",
  EXT_INSTANCE_ID: "extension-id",
  DATABASE_INSTANCE: "project-id-default-rtdb",
  DATABASE_URL: "https://project-id-default-rtdb.firebaseio.com",
};
export const resourceTypeToNiceName: Record<string, string> = {
  "firebaseextensions.v1beta.function": "Cloud Function",
};
export type ReleaseStage = "alpha" | "beta" | "rc" | "stable";
const repoRegex = new RegExp(`^https:\/\/github\.com\/[^\/]+\/[^\/]+$`);
const stageOptions = ["rc", "alpha", "beta", "stable"];

/**
 * Turns database URLs (e.g. https://my-db.firebaseio.com) into database instance names
 * (e.g. my-db), which can be used in a function trigger.
 * @param databaseUrl Fully qualified realtime database URL
 */
export function getDBInstanceFromURL(databaseUrl = ""): string {
  const instanceRegex = new RegExp("(?:https://)(.*)(?:.firebaseio.com)");
  const matches = instanceRegex.exec(databaseUrl);
  if (matches && matches.length > 1) {
    return matches[1];
  }
  return "";
}

/**
 * Gets Firebase project specific param values.
 */
export async function getFirebaseProjectParams(
  projectId: string | undefined,
  emulatorMode: boolean = false,
): Promise<Record<string, string>> {
  if (!projectId) {
    return {};
  }
  const body = emulatorMode
    ? await getProjectAdminSdkConfigOrCached(projectId)
    : await getFirebaseConfig({ project: projectId });
  const projectNumber =
    emulatorMode && Constants.isDemoProject(projectId)
      ? Constants.FAKE_PROJECT_NUMBER
      : await getProjectNumber({ projectId });
  const databaseURL = body?.databaseURL ?? `https://${projectId}.firebaseio.com`;
  const storageBucket = body?.storageBucket ?? `${projectId}.appspot.com`;
  // This env variable is needed for parameter-less initialization of firebase-admin
  const FIREBASE_CONFIG = JSON.stringify({
    projectId,
    databaseURL,
    storageBucket,
  });

  return {
    PROJECT_ID: projectId,
    PROJECT_NUMBER: projectNumber,
    DATABASE_URL: databaseURL,
    STORAGE_BUCKET: storageBucket,
    FIREBASE_CONFIG,
    DATABASE_INSTANCE: getDBInstanceFromURL(databaseURL),
  };
}

/**
 * This function substitutes params used in the extension spec with values.
 * (e.g If the original object contains `path/${FOO}` or `path/${param:FOO}` and the param FOO has the value of "bar",
 * then it will become `path/bar`)
 * @param original Object containing strings that have placeholders that look like`${}`
 * @param params params to substitute the placeholders for
 * @return Resources object with substituted params
 */
export function substituteParams<T>(original: T, params: Record<string, string>): T {
  const startingString = JSON.stringify(original);
  const applySubstitution = (str: string, paramVal: string, paramKey: string): string => {
    const exp1 = new RegExp("\\$\\{" + paramKey + "\\}", "g");
    const exp2 = new RegExp("\\$\\{param:" + paramKey + "\\}", "g");
    const regexes = [exp1, exp2];
    const substituteRegexMatches = (unsubstituted: string, regex: RegExp): string => {
      return unsubstituted.replace(regex, paramVal);
    };
    return regexes.reduce(substituteRegexMatches, str);
  };
  const s = Object.entries(params).reduce(
    (str, [key, val]) => applySubstitution(str, val, key),
    startingString,
  );
  return JSON.parse(s);
}

/**
 * Sets params equal to defaults given in extension.yaml if not already set in .env file.
 *
 * @param paramVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 * @return JSON object of params
 */
export function populateDefaultParams(
  paramVars: Record<string, string>,
  paramSpecs: Param[],
): Record<string, string> {
  const newParams = paramVars;

  for (const param of paramSpecs) {
    if (!paramVars[param.param]) {
      if (param.default !== undefined && param.required) {
        newParams[param.param] = param.default;
      } else if (param.required) {
        throw new FirebaseError(
          `${param.param} has not been set in the given params file` +
            " and there is no default available. Please set this variable before installing again.",
        );
      }
    }
  }

  return newParams;
}

/**
 * Validates command-line params supplied by developer.
 * @param envVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 */
export function validateCommandLineParams(
  envVars: Record<string, string>,
  paramSpec: Param[],
): void {
  const paramNames = paramSpec.map((p) => p.param);
  const misnamedParams = Object.keys(envVars).filter((key: string) => {
    return !paramNames.includes(key) && !AUTOPOPULATED_PARAM_NAMES.includes(key);
  });
  if (misnamedParams.length) {
    logger.warn(
      "Warning: The following params were specified in your env file but do not exist in the extension spec: " +
        `${misnamedParams.join(", ")}.`,
    );
  }
  let allParamsValid = true;
  for (const param of paramSpec) {
    // Warns if invalid response was found in environment file.
    if (!checkResponse(envVars[param.param], param)) {
      allParamsValid = false;
    }
  }
  if (!allParamsValid) {
    throw new FirebaseError(`Some param values are not valid. Please check your params file.`);
  }
}

/**
 * Validates an Extension.yaml by checking that all required fields are present
 * and checking that invalid combinations of fields are not present.
 * @param spec An extension.yaml to validate.
 */
export function validateSpec(spec: any) {
  const errors = [];
  if (!spec.name) {
    errors.push("extension.yaml is missing required field: name");
  }
  if (!spec.specVersion) {
    errors.push("extension.yaml is missing required field: specVersion");
  }
  if (!spec.version) {
    errors.push("extension.yaml is missing required field: version");
  } else if (!semver.valid(spec.version)) {
    errors.push(`version ${spec.version} in extension.yaml is not a valid semver`);
  } else {
    const version = semver.parse(spec.version)!;
    if (version.prerelease.length > 0 || version.build.length > 0) {
      errors.push(
        "version field in extension.yaml does not support pre-release annotations; instead, set a pre-release stage using the --stage flag",
      );
    }
  }
  if (!spec.license) {
    errors.push("extension.yaml is missing required field: license");
  } else {
    const formattedLicense = String(spec.license).toLocaleLowerCase();
    if (!VALID_LICENSES.includes(formattedLicense)) {
      errors.push(
        `license field in extension.yaml is invalid. Valid value(s): ${VALID_LICENSES.join(", ")}`,
      );
    }
  }
  if (!spec.resources) {
    errors.push("Resources field must contain at least one resource");
  } else {
    for (const resource of spec.resources) {
      if (!resource.name) {
        errors.push("Resource is missing required field: name");
      }
      if (!resource.type) {
        errors.push(
          `Resource${resource.name ? ` ${resource.name}` : ""} is missing required field: type`,
        );
      }
    }
  }
  for (const api of spec.apis || []) {
    if (!api.apiName) {
      errors.push("API is missing required field: apiName");
    }
  }
  for (const role of spec.roles || []) {
    if (!role.role) {
      errors.push("Role is missing required field: role");
    }
  }
  for (const param of spec.params || []) {
    if (!param.param) {
      errors.push("Param is missing required field: param");
    }
    if (!param.label) {
      errors.push(`Param${param.param ? ` ${param.param}` : ""} is missing required field: label`);
    }
    if (param.type && !Object.values(SpecParamType).includes(param.type)) {
      errors.push(
        `Invalid type ${param.type} for param${
          param.param ? ` ${param.param}` : ""
        }. Valid types are ${Object.values(SpecParamType).join(", ")}`,
      );
    }
    if (!param.type || param.type === SpecParamType.STRING) {
      // ParamType defaults to STRING
      if (param.options) {
        errors.push(
          `Param${
            param.param ? ` ${param.param}` : ""
          } cannot have options because it is type STRING`,
        );
      }
    }
    if (
      param.type &&
      (param.type === SpecParamType.SELECT || param.type === SpecParamType.MULTISELECT)
    ) {
      if (param.validationRegex) {
        errors.push(
          `Param${
            param.param ? ` ${param.param}` : ""
          } cannot have validationRegex because it is type ${param.type}`,
        );
      }
      if (!param.options) {
        errors.push(
          `Param${param.param ? ` ${param.param}` : ""} requires options because it is type ${
            param.type
          }`,
        );
      }
      for (const opt of param.options || []) {
        if (opt.value === undefined) {
          errors.push(
            `Option for param${
              param.param ? ` ${param.param}` : ""
            } is missing required field: value`,
          );
        }
      }
    }
    if (param.type && param.type === SpecParamType.SELECTRESOURCE) {
      if (!param.resourceType) {
        errors.push(
          `Param${param.param ? ` ${param.param}` : ""} must have resourceType because it is type ${
            param.type
          }`,
        );
      }
    }
  }
  if (errors.length) {
    const formatted = errors.map((error) => `  - ${error}`);
    const message = `The extension.yaml has the following errors: \n${formatted.join("\n")}`;
    throw new FirebaseError(message);
  }
}

/**
 * @param instanceId ID of the extension instance
 */
export async function promptForValidInstanceId(instanceId: string): Promise<string> {
  let instanceIdIsValid = false;
  let newInstanceId = "";
  const instanceIdRegex = /^[a-z][a-z\d\-]*[a-z\d]$/;
  while (!instanceIdIsValid) {
    newInstanceId = await promptOnce({
      type: "input",
      default: instanceId,
      message: `Please enter a new name for this instance:`,
    });
    if (newInstanceId.length <= 6 || 45 <= newInstanceId.length) {
      logger.info("Invalid instance ID. Instance ID must be between 6 and 45 characters.");
    } else if (!instanceIdRegex.test(newInstanceId)) {
      logger.info(
        "Invalid instance ID. Instance ID must start with a lowercase letter, " +
          "end with a lowercase letter or number, and only contain lowercase letters, numbers, or -",
      );
    } else {
      instanceIdIsValid = true;
    }
  }
  return newInstanceId;
}

/**
 * Prompts for a valid repo URI.
 */
export async function promptForValidRepoURI(): Promise<string> {
  let repoIsValid = false;
  let extensionRoot = "";
  while (!repoIsValid) {
    extensionRoot = await promptOnce({
      type: "input",
      message: "Enter the GitHub repo URI where this extension's source code is located:",
    });
    if (!repoRegex.test(extensionRoot)) {
      logger.info("Repo URI must follow this format: https://github.com/<user>/<repo>");
    } else {
      repoIsValid = true;
    }
  }
  return extensionRoot;
}

/**
 * Prompts for an extension root.
 *
 * @param defaultRoot the default extension root
 */
export async function promptForExtensionRoot(defaultRoot: string): Promise<string> {
  return await promptOnce({
    type: "input",
    message:
      "Enter this extension's root directory in the repo (defaults to previous root if set):",
    default: defaultRoot,
  });
}

/**
 * Prompts for the extension version's release stage.
 *
 * @param versionByStage map from stage to the next version to upload
 * @param autoReview whether the stable version will be automatically sent for review on upload
 * @param allowStable whether to allow stable versions
 * @param hasVersions whether there have been any pre-release versions uploaded already
 */
async function promptForReleaseStage(args: {
  versionByStage: Map<string, string>;
  autoReview: boolean;
  allowStable: boolean;
  hasVersions: boolean;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ReleaseStage> {
  let stage: ReleaseStage = "rc";
  if (!args.nonInteractive) {
    const choices = [
      { name: `Release candidate (${args.versionByStage.get("rc")})`, value: "rc" },
      { name: `Alpha (${args.versionByStage.get("alpha")})`, value: "alpha" },
      { name: `Beta (${args.versionByStage.get("beta")})`, value: "beta" },
    ];
    if (args.allowStable) {
      const stableChoice = {
        name: `Stable (${args.versionByStage.get("stable")}${
          args.autoReview ? ", automatically sent for review" : ""
        })`,
        value: "stable",
      };
      choices.push(stableChoice);
    }
    stage = await promptOnce({
      type: "list",
      message: "Choose the release stage:",
      choices: choices,
      default: stage,
    });
    if (stage === "stable" && !args.hasVersions) {
      logger.info(
        `${clc.bold(
          clc.yellow("Warning:"),
        )} It's highly recommended to first upload a pre-release version before choosing stable.`,
      );
      const confirmed = await confirm({
        nonInteractive: args.nonInteractive,
        force: args.force,
        default: false,
      });
      if (!confirmed) {
        stage = await promptOnce({
          type: "list",
          message: "Choose the release stage:",
          choices: choices,
          default: stage,
        });
      }
    }
  }
  return stage;
}

export async function ensureExtensionsApiEnabled(options: any): Promise<void> {
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  return await ensure(
    projectId,
    "firebaseextensions.googleapis.com",
    "extensions",
    options.markdown,
  );
}

export async function ensureExtensionsPublisherApiEnabled(options: any): Promise<void> {
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  return await ensure(
    projectId,
    "firebaseextensionspublisher.googleapis.com",
    "extensions",
    options.markdown,
  );
}

/**
 * Zips and uploads a local extension to a bucket.
 * @param extPath a local path to archive and upload
 * @param bucketName the bucket to upload to
 * @return the path where the source was uploaded to
 */
async function archiveAndUploadSource(extPath: string, bucketName: string): Promise<string> {
  const zippedSource = await archiveDirectory(extPath, {
    type: "zip",
    ignore: ["node_modules", ".git"],
  });
  const res = await uploadObject(zippedSource, bucketName);
  return `/${res.bucket}/${res.object}`;
}

/**
 * Gets a list of the next version to upload by release stage.
 *
 * @param extensionRef the ref of the extension
 * @param version the new version of the extension
 */
export async function getNextVersionByStage(
  extensionRef: string,
  newVersion: string,
): Promise<{ versionByStage: Map<string, string>; hasVersions: boolean }> {
  let extensionVersions: ExtensionVersion[] = [];
  try {
    extensionVersions = await listExtensionVersions(extensionRef, `id="${newVersion}"`, true);
  } catch (err: any) {
    // Silently fail if no extension versions exist.
  }
  // Maps stage to default next version (e.g. "rc" => "1.0.0-rc.0").
  const versionByStage = new Map(
    ["rc", "alpha", "beta"].map((stage) => [
      stage,
      semver.inc(`${newVersion}-${stage}`, "prerelease", undefined, stage)!,
    ]),
  );
  for (const extensionVersion of extensionVersions) {
    const version = semver.parse(extensionVersion.spec.version)!;
    if (!version.prerelease.length) {
      continue;
    }
    // Extensions only support a single prerelease annotation.
    const prerelease = semver.prerelease(version)![0];
    // Parse out stage from prerelease (e.g. "rc" from "rc.0").
    const stage = prerelease.split(".")[0];
    if (versionByStage.has(stage) && semver.gte(version, versionByStage.get(stage)!)) {
      versionByStage.set(stage, semver.inc(version, "prerelease", undefined, stage)!);
    }
  }
  versionByStage.set("stable", newVersion);
  return { versionByStage, hasVersions: extensionVersions.length > 0 };
}

/**
 * Validates the extension spec.
 *
 * @param rootDirectory the directory with the extension source
 * @param extensionRef the ref of the extension
 */
async function validateExtensionSpec(
  rootDirectory: string,
  extensionId: string,
): Promise<ExtensionSpec> {
  const extensionSpec = await getLocalExtensionSpec(rootDirectory);
  if (extensionSpec.name !== extensionId) {
    throw new FirebaseError(
      `Extension ID '${clc.bold(
        extensionId,
      )}' does not match the name in extension.yaml '${clc.bold(extensionSpec.name)}'.`,
    );
  }
  // Substitute deepcopied spec with autopopulated params, and make sure that it passes basic extension.yaml validation.
  const subbedSpec = JSON.parse(JSON.stringify(extensionSpec));
  subbedSpec.params = substituteParams<Param[]>(
    extensionSpec.params || [],
    AUTOPOULATED_PARAM_PLACEHOLDERS,
  );
  validateSpec(subbedSpec);
  return extensionSpec;
}

/**
 * Validates the release notes.
 *
 * @param rootDirectory the directory with the extension source
 * @param newVersion the new extension version
 */
function validateReleaseNotes(rootDirectory: string, newVersion: string, extension?: Extension) {
  let notes: string;
  try {
    const changes = getLocalChangelog(rootDirectory);
    notes = changes[newVersion];
  } catch (err: any) {
    throw new FirebaseError(
      "No CHANGELOG.md file found. " +
        "Please create one and add an entry for this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/publishers/user-documentation#writing-changelog for more details.",
        ),
    );
  }
  // Notes are required for all stable versions after the initial release.
  if (!notes && !semver.prerelease(newVersion) && extension) {
    throw new FirebaseError(
      `No entry for version ${newVersion} found in CHANGELOG.md. ` +
        "Please add one so users know what has changed in this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/publishers/user-documentation#writing-changelog for more details.",
        ),
    );
  }
  return notes;
}

/**
 * Validates the extension version.
 *
 * @param extensionRef the ref of the extension
 * @param newVersion the new extension version
 * @param latestVersion the latest extension version
 */
function validateVersion(extensionRef: string, newVersion: string, latestVersion?: string) {
  if (latestVersion) {
    if (semver.lt(newVersion, latestVersion)) {
      throw new FirebaseError(
        `The version you are trying to publish (${clc.bold(
          newVersion,
        )}) is lower than the current version (${clc.bold(
          latestVersion,
        )}) for the extension '${clc.bold(
          extensionRef,
        )}'. Make sure this version is greater than the current version (${clc.bold(
          latestVersion,
        )}) inside of extension.yaml and try again.\n`,
        { exit: 104 },
      );
    } else if (semver.eq(newVersion, latestVersion)) {
      throw new FirebaseError(
        `The version you are trying to upload (${clc.bold(
          newVersion,
        )}) already exists for extension '${clc.bold(
          extensionRef,
        )}'. Increment the version inside of extension.yaml and try again.\n`,
        { exit: 103 },
      );
    }
  }
}

/** Unpacks extension state into a more specific string. */
export function unpackExtensionState(extension: Extension) {
  switch (extension.state) {
    case "PUBLISHED":
      // Unpacking legacy "published" terminology.
      if (extension.latestApprovedVersion) {
        return clc.bold(clc.green("Published"));
      } else if (extension.latestVersion) {
        return clc.green("Uploaded");
      } else {
        return "Prerelease";
      }
    case "DEPRECATED":
      return clc.red("Deprecated");
    case "SUSPENDED":
      return clc.bold(clc.red("Suspended"));
    default:
      return "-";
  }
}

/**
 * Displays metadata about the extension being uploaded.
 *
 * @param extensionRef the ref of the extension
 */
function displayExtensionHeader(
  extensionRef: string,
  extension?: Extension,
  extensionRoot?: string,
) {
  if (extension) {
    let source = "Local source";
    if (extension.repoUri) {
      const uri = new URL(extension.repoUri!);
      uri.pathname = path.join(uri.pathname, extensionRoot ?? "");
      source = `${uri.toString()} (use --repo and --root to modify)`;
    }
    logger.info(
      `\n${clc.bold("Extension:")} ${extension.ref}\n` +
        `${clc.bold("State:")} ${unpackExtensionState(extension)}\n` +
        `${clc.bold("Latest Version:")} ${extension.latestVersion ?? "-"}\n` +
        `${clc.bold("Version in Extensions Hub:")} ${extension.latestApprovedVersion ?? "-"}\n` +
        `${clc.bold("Source in GitHub:")} ${source}\n`,
    );
  } else {
    logger.info(
      `\n${clc.bold("Extension:")} ${extensionRef}\n` +
        `${clc.bold("State:")} ${clc.bold(clc.blue("New"))}\n`,
    );
  }
}

/**
 * Fetches the extension source from GitHub.
 *
 * @param repoUri the public GitHub repo URI that contains the extension source
 * @param sourceRef the commit hash, branch, or tag to build from the repo
 * @param extensionRoot the root directory that contains this extension
 */
async function fetchExtensionSource(
  repoUri: string,
  sourceRef: string,
  extensionRoot: string,
): Promise<string> {
  const sourceUri = repoUri + path.join("/tree", sourceRef, extensionRoot);
  logger.info(`Validating source code at ${clc.bold(sourceUri)}...`);
  const archiveUri = `${repoUri}/archive/${sourceRef}.zip`;
  const tempDirectory = tmp.dirSync({ unsafeCleanup: true });
  const archiveErrorMessage = `Failed to extract archive from ${clc.bold(
    archiveUri,
  )}. Please check that the repo is public and that the source ref is valid.`;
  try {
    const response = await fetch(archiveUri);
    if (response.ok) {
      await response.body.pipe(createUnzipTransform(tempDirectory.name)).promise();
    }
  } catch (err: any) {
    throw new FirebaseError(archiveErrorMessage);
  }
  const archiveName = fs.readdirSync(tempDirectory.name)[0];
  if (!archiveName) {
    throw new FirebaseError(archiveErrorMessage);
  }
  const rootDirectory = path.join(tempDirectory.name, archiveName, extensionRoot);
  // Pre-validation to show a more useful error message in the context of a temp directory.
  try {
    readFile(path.resolve(rootDirectory, EXTENSIONS_SPEC_FILE));
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to find ${clc.bold(EXTENSIONS_SPEC_FILE)} in directory ${clc.bold(
        extensionRoot,
      )}. Please verify the root and try again.`,
    );
  }
  return rootDirectory;
}

/**
 * Uploads an extension version from a GitHub repo.
 *
 * @param publisherId the ID of the Publisher this Extension will be published under
 * @param extensionId the ID of the Extension to be published
 * @param repoUri the URI of the repo where this Extension's source exists
 * @param sourceRef the commit hash, branch, or tag name in the repo to publish from
 * @param extensionRoot the root directory that contains this Extension's source
 * @param stage the release stage to publish
 * @param nonInteractive whether to display prompts
 * @param force whether to force confirmations
 */
export async function uploadExtensionVersionFromGitHubSource(args: {
  publisherId: string;
  extensionId: string;
  repoUri?: string;
  sourceRef?: string;
  extensionRoot?: string;
  stage?: ReleaseStage;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ExtensionVersion | undefined> {
  const extensionRef = `${args.publisherId}/${args.extensionId}`;
  let extension: Extension | undefined;
  let latestVersion: ExtensionVersion | undefined;
  try {
    extension = await getExtension(extensionRef);
    latestVersion = await getExtensionVersion(`${extensionRef}@latest`);
  } catch (err: any) {
    // Silently fail and continue if extension is new or has no latest version set.
  }
  displayExtensionHeader(extensionRef, extension, latestVersion?.extensionRoot);

  if (args.stage && !stageOptions.includes(args.stage)) {
    throw new FirebaseError(
      `--stage only supports the following values: ${stageOptions.join(", ")}`,
    );
  }

  // Prompt for repo URI.
  if (args.repoUri && !repoRegex.test(args.repoUri)) {
    throw new FirebaseError("Repo URI must follow this format: https://github.com/<user>/<repo>");
  }
  let repoUri = args.repoUri || extension?.repoUri;
  if (!repoUri) {
    if (!args.nonInteractive) {
      repoUri = await promptForValidRepoURI();
    } else {
      throw new FirebaseError("Repo URI is required but not currently set.");
    }
  }

  let extensionRoot = args.extensionRoot || latestVersion?.extensionRoot;
  if (!extensionRoot) {
    const defaultRoot = "/";
    if (!args.nonInteractive) {
      extensionRoot = await promptForExtensionRoot(defaultRoot);
    } else {
      extensionRoot = defaultRoot;
    }
  }
  // Normalize root path and strip leading and trailing slashes and all `../`.
  const normalizedRoot = path
    .normalize(extensionRoot)
    .replaceAll(/^\/|\/$/g, "")
    .replaceAll(/^(\.\.\/)*/g, "");
  extensionRoot = normalizedRoot || "/";

  // Prompt for source ref and default to HEAD.
  let sourceRef = args.sourceRef;
  const defaultSourceRef = "HEAD";
  if (!sourceRef) {
    if (!args.nonInteractive) {
      sourceRef = await promptOnce({
        type: "input",
        message: "Enter the commit hash, branch, or tag name to build from in the repo:",
        default: defaultSourceRef,
      });
    } else {
      sourceRef = defaultSourceRef;
    }
  }

  const rootDirectory = await fetchExtensionSource(repoUri, sourceRef, extensionRoot);
  const extensionSpec = await validateExtensionSpec(rootDirectory, args.extensionId);
  validateVersion(extensionRef, extensionSpec.version, extension?.latestVersion);
  const { versionByStage, hasVersions } = await getNextVersionByStage(
    extensionRef,
    extensionSpec.version,
  );
  const autoReview =
    !!extension?.latestApprovedVersion ||
    latestVersion?.listing?.state === "PENDING" ||
    latestVersion?.listing?.state === "APPROVED" ||
    latestVersion?.listing?.state === "REJECTED";

  // Prompt for release stage.
  let stage = args.stage;
  if (!stage) {
    stage = await promptForReleaseStage({
      versionByStage,
      autoReview,
      allowStable: true,
      hasVersions,
      nonInteractive: args.nonInteractive,
      force: args.force,
    });
  }

  const newVersion = versionByStage.get(stage)!;
  const releaseNotes = validateReleaseNotes(rootDirectory, extensionSpec.version, extension);
  const sourceUri = repoUri + path.join("/tree", sourceRef, extensionRoot);
  displayReleaseNotes({
    extensionRef,
    newVersion,
    releaseNotes,
    sourceUri,
    autoReview: stage === "stable" && autoReview,
  });
  const confirmed = await confirm({
    nonInteractive: args.nonInteractive,
    force: args.force,
    default: false,
  });
  if (!confirmed) {
    return;
  }

  // Upload the extension version.
  const extensionVersionRef = `${extensionRef}@${newVersion}`;
  const uploadSpinner = ora(`Uploading ${clc.bold(extensionVersionRef)}...`);
  let res;
  try {
    uploadSpinner.start();
    res = await createExtensionVersionFromGitHubSource({
      extensionVersionRef,
      extensionRoot,
      repoUri,
      sourceRef: sourceRef,
    });
    uploadSpinner.succeed(`Successfully uploaded ${clc.bold(extensionRef)}`);
  } catch (err: any) {
    uploadSpinner.fail();
    if (err.status === 404) {
      throw getMissingPublisherError(args.publisherId);
    }
    throw err;
  }
  return res;
}

/**
 * Uploads an extension version from local source.
 *
 * @param publisherId the ID of the Publisher this Extension will be published under
 * @param extensionId the ID of the Extension to be published
 * @param rootDirectory the root directory that contains this Extension's source
 * @param stage the release stage to publish
 * @param nonInteractive whether to display prompts
 * @param force whether to force confirmations
 */
export async function uploadExtensionVersionFromLocalSource(args: {
  publisherId: string;
  extensionId: string;
  rootDirectory: string;
  stage: ReleaseStage;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ExtensionVersion | undefined> {
  const extensionRef = `${args.publisherId}/${args.extensionId}`;
  let extension: Extension | undefined;
  let latestVersion: ExtensionVersion | undefined;
  try {
    extension = await getExtension(extensionRef);
    latestVersion = await getExtensionVersion(`${extensionRef}@latest`);
  } catch (err: any) {
    // Silently fail and continue if extension is new or has no latest version set.
  }
  displayExtensionHeader(extensionRef, extension, latestVersion?.extensionRoot);

  const localStageOptions = ["rc", "alpha", "beta"];
  if (args.stage && !localStageOptions.includes(args.stage)) {
    throw new FirebaseError(
      `--stage only supports the following values when used with --local: ${localStageOptions.join(
        ", ",
      )}`,
    );
  }

  const extensionSpec = await validateExtensionSpec(args.rootDirectory, args.extensionId);
  validateVersion(extensionRef, extensionSpec.version, extension?.latestVersion);
  const { versionByStage } = await getNextVersionByStage(extensionRef, extensionSpec.version);

  // Prompt for release stage.
  let stage = args.stage;
  if (!stage) {
    if (!args.nonInteractive) {
      stage = await promptForReleaseStage({
        versionByStage,
        autoReview: false,
        allowStable: false,
        hasVersions: false,
        nonInteractive: args.nonInteractive,
        force: args.force,
      });
    } else {
      stage = "rc";
    }
  }

  const newVersion = versionByStage.get(stage)!;
  const releaseNotes = validateReleaseNotes(args.rootDirectory, extensionSpec.version, extension);
  displayReleaseNotes({ extensionRef, newVersion, releaseNotes, autoReview: false });
  const confirmed = await confirm({
    nonInteractive: args.nonInteractive,
    force: args.force,
    default: false,
  });
  if (!confirmed) {
    return;
  }

  const extensionVersionRef = `${extensionRef}@${newVersion}`;
  let packageUri: string;
  let objectPath = "";
  const uploadSpinner = ora("Archiving and uploading extension source code...");
  try {
    uploadSpinner.start();
    objectPath = await archiveAndUploadSource(args.rootDirectory, EXTENSIONS_BUCKET_NAME);
    uploadSpinner.succeed("Uploaded extension source code");
    packageUri = storageOrigin + objectPath + "?alt=media";
  } catch (err: any) {
    uploadSpinner.fail();
    throw new FirebaseError(`Failed to archive and upload extension source code, ${err}`, {
      original: err,
    });
  }
  const publishSpinner = ora(`Uploading ${clc.bold(extensionVersionRef)}...`);
  let res;
  try {
    publishSpinner.start();
    res = await createExtensionVersionFromLocalSource({ extensionVersionRef, packageUri });
    publishSpinner.succeed(`Successfully uploaded ${clc.bold(extensionVersionRef)}`);
  } catch (err: any) {
    publishSpinner.fail();
    if (err.status === 404) {
      throw getMissingPublisherError(args.publisherId);
    }
    throw err;
  }
  await deleteUploadedSource(objectPath);
  return res;
}

export function getMissingPublisherError(publisherId: string): FirebaseError {
  return new FirebaseError(
    marked(
      `Couldn't find publisher ID '${clc.bold(
        publisherId,
      )}'. Please ensure that you have registered this ID. For step-by-step instructions on getting started as a publisher, see https://firebase.google.com/docs/extensions/publishers/get-started.`,
    ),
  );
}

/**
 * Creates a source from a local path or URL. If a local path is given, it will be zipped
 * and uploaded to EXTENSIONS_BUCKET_NAME, and then deleted after the source is created.
 * @param projectId the project to create the source in
 * @param sourceUri a local path containing an extension or a URL pointing at a zipped extension
 */
export async function createSourceFromLocation(
  projectId: string,
  sourceUri: string,
): Promise<ExtensionSource> {
  const extensionRoot = "/";
  let packageUri: string;
  let objectPath = "";

  const spinner = ora(" Archiving and uploading extension source code");
  try {
    spinner.start();
    objectPath = await archiveAndUploadSource(sourceUri, EXTENSIONS_BUCKET_NAME);
    spinner.succeed(" Uploaded extension source code");

    packageUri = storageOrigin + objectPath + "?alt=media";
    const res = await createSource(projectId, packageUri, extensionRoot);
    logger.debug("Created new Extension Source %s", res.name);

    // if we uploaded an object to user's bucket, delete it after "createSource" copies it into extension service's bucket.
    await deleteUploadedSource(objectPath);
    return res;
  } catch (err: any) {
    spinner.fail();
    throw new FirebaseError(
      `Failed to archive and upload extension source from ${sourceUri}, ${err}`,
      {
        original: err,
      },
    );
  }
}

/**
 * Cleans up uploaded ZIP file after creating an extension source or publishing an extension version.
 */
async function deleteUploadedSource(objectPath: string) {
  if (objectPath.length) {
    try {
      await deleteObject(objectPath);
      logger.debug("Cleaned up uploaded source archive");
    } catch (err: any) {
      logger.debug("Unable to clean up uploaded source archive");
    }
  }
}

/**
 * Parses the publisher project number from publisher profile name.
 */
export function getPublisherProjectFromName(publisherName: string): number {
  const publisherNameRegex = /projects\/.+\/publisherProfile/;

  if (publisherNameRegex.test(publisherName)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, projectNumber, __] = publisherName.split("/");
    return Number.parseInt(projectNumber);
  }
  throw new FirebaseError(`Could not find publisher with name '${publisherName}'.`);
}

/**
 * Displays the release notes and confirmation message for the extension to be uploaded.
 *
 * @param extensionRef the ref of the extension
 * @param newVersion the new version of the extension
 * @param releaseNotes the release notes for the version being uploaded (if any)
 * @param sourceUri the source URI from which the extension will be uploaded
 */
export function displayReleaseNotes(args: {
  extensionRef: string;
  newVersion: string;
  autoReview: boolean;
  releaseNotes?: string;
  sourceUri?: string;
}): void {
  const source = args.sourceUri || "Local source";
  const releaseNotesMessage = args.releaseNotes
    ? `${clc.bold("Release notes:")}\n${marked(args.releaseNotes)}`
    : "\n";
  const metadataMessage =
    `${clc.bold("Extension:")} ${args.extensionRef}\n` +
    `${clc.bold("Version:")} ${clc.bold(clc.green(args.newVersion))} ${
      args.autoReview ? "(automatically sent for review)" : ""
    }\n` +
    `${clc.bold("Source:")} ${source}\n`;
  const message =
    `\nYou are about to upload a new version to Firebase's registry of extensions.\n\n` +
    metadataMessage +
    releaseNotesMessage +
    `Once an extension version is uploaded, it becomes installable by other users and cannot be changed. If you wish to make changes after uploading, you will need to upload a new version.\n`;
  logger.info(message);
}

/**
 * Display list of all official extensions and prompt user to select one.
 * @param message The prompt message to display
 * @return Promise that resolves to the extension name (e.g. storage-resize-images)
 */
export async function promptForOfficialExtension(message: string): Promise<string> {
  const officialExts = await getExtensionRegistry(true);
  return await promptOnce({
    name: "input",
    type: "list",
    message,
    choices: convertOfficialExtensionsToList(officialExts),
    pageSize: Object.keys(officialExts).length,
  });
}

/**
 * Confirm if the user wants to install another instance of an extension when they already have one.
 * @param extensionName The name of the extension being installed.
 * @param projectName The name of the project in use.
 */
export async function promptForRepeatInstance(
  projectName: string,
  extensionName: string,
): Promise<"updateExisting" | "installNew" | "cancel"> {
  const message = `An extension with the ID '${clc.bold(
    extensionName,
  )}' already exists in the project '${clc.bold(projectName)}'. What would you like to do?`;
  const choices = [
    { name: "Update or reconfigure the existing instance", value: "updateExisting" },
    { name: "Install a new instance with a different ID", value: "installNew" },
    { name: "Cancel extension installation", value: "cancel" },
  ];
  return await promptOnce({
    type: "list",
    message,
    choices,
  });
}

/**
 * Checks to see if an extension instance exists.
 * @param projectId ID of the project in use
 * @param instanceId ID of the extension instance
 */
export async function instanceIdExists(projectId: string, instanceId: string): Promise<boolean> {
  try {
    await getInstance(projectId, instanceId);
  } catch (err: unknown) {
    if (err instanceof FirebaseError) {
      if (err.status === 404) {
        return false;
      }
      const msg = `Unexpected error when checking if instance ID exists: ${err}`;
      throw new FirebaseError(msg, {
        original: err,
      });
    } else {
      throw err;
    }
  }
  return true;
}

export function isUrlPath(extInstallPath: string): boolean {
  return extInstallPath.startsWith("https:");
}

export function isLocalPath(extInstallPath: string): boolean {
  const trimmedPath = extInstallPath.trim();
  return (
    trimmedPath.startsWith("~/") ||
    trimmedPath.startsWith("./") ||
    trimmedPath.startsWith("../") ||
    trimmedPath.startsWith("/") ||
    [".", ".."].includes(trimmedPath)
  );
}

export function isLocalOrURLPath(extInstallPath: string): boolean {
  return isLocalPath(extInstallPath) || isUrlPath(extInstallPath);
}

/**
 * Given an update source, return where the update source came from.
 * @param sourceOrVersion path to a source or reference to a source version
 */
export function getSourceOrigin(sourceOrVersion: string): SourceOrigin {
  // First, check if the input matches a local or URL.
  if (isLocalPath(sourceOrVersion)) {
    return SourceOrigin.LOCAL;
  }
  if (isUrlPath(sourceOrVersion)) {
    return SourceOrigin.URL;
  }
  // Next, check if the source is an extension reference.
  if (sourceOrVersion.includes("/")) {
    let ref;
    try {
      ref = refs.parse(sourceOrVersion);
    } catch (err: any) {
      // Silently fail.
    }
    if (ref && ref.publisherId && ref.extensionId && !ref.version) {
      return SourceOrigin.PUBLISHED_EXTENSION;
    } else if (ref && ref.publisherId && ref.extensionId && ref.version) {
      return SourceOrigin.PUBLISHED_EXTENSION_VERSION;
    }
  }
  throw new FirebaseError(
    `Could not find source '${clc.bold(
      sourceOrVersion,
    )}'. Check to make sure the source is correct, and then please try again.`,
  );
}

export async function diagnoseAndFixProject(options: any): Promise<void> {
  const projectId = getProjectId(options);
  if (!projectId) {
    return;
  }
  const ok = await diagnose(projectId);
  if (!ok) {
    throw new FirebaseError("Unable to proceed until all issues are resolved.");
  }
}
