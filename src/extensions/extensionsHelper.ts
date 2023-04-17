import * as clc from "colorette";
import * as ora from "ora";
import * as semver from "semver";
import * as tmp from "tmp";
import * as fs from "fs-extra";
import * as unzipper from "unzipper";
import fetch from "node-fetch";
import * as path from "path";
import { marked } from "marked";

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
import {
  createSource,
  getExtension,
  getExtensionVersion,
  getInstance,
  listExtensionVersions,
  publishExtensionVersion,
} from "./extensionsApi";
import { Extension, ExtensionSource, ExtensionSpec, ExtensionVersion, Param } from "./types";
import * as refs from "./refs";
import { EXTENSIONS_SPEC_FILE, readFile, getLocalExtensionSpec } from "./localHelper";
import { confirm, promptOnce } from "../prompt";
import { logger } from "../logger";
import { envOverride } from "../utils";
import { getLocalChangelog } from "./change-log";
import { getProjectNumber } from "../getProjectNumber";
import { Constants } from "../emulator/constants";
import { resolveVersion } from "../deploy/extensions/planner";

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
  "firebase-ext-eap-uploads"
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
const stageOptions = ["alpha", "beta", "rc", "stable"];

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
  emulatorMode: boolean = false
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
    startingString
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
  paramSpecs: Param[]
): Record<string, string> {
  const newParams = paramVars;

  for (const param of paramSpecs) {
    if (!paramVars[param.param]) {
      if (param.default !== undefined && param.required) {
        newParams[param.param] = param.default;
      } else if (param.required) {
        throw new FirebaseError(
          `${param.param} has not been set in the given params file` +
            " and there is no default available. Please set this variable before installing again."
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
  paramSpec: Param[]
): void {
  const paramNames = paramSpec.map((p) => p.param);
  const misnamedParams = Object.keys(envVars).filter((key: string) => {
    return !paramNames.includes(key) && !AUTOPOPULATED_PARAM_NAMES.includes(key);
  });
  if (misnamedParams.length) {
    logger.warn(
      "Warning: The following params were specified in your env file but do not exist in the extension spec: " +
        `${misnamedParams.join(", ")}.`
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
  }
  if (!spec.license) {
    errors.push("extension.yaml is missing required field: license");
  } else {
    const formattedLicense = String(spec.license).toLocaleLowerCase();
    if (!VALID_LICENSES.includes(formattedLicense)) {
      errors.push(
        `license field in extension.yaml is invalid. Valid value(s): ${VALID_LICENSES.join(", ")}`
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
          `Resource${resource.name ? ` ${resource.name}` : ""} is missing required field: type`
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
        }. Valid types are ${Object.values(SpecParamType).join(", ")}`
      );
    }
    if (!param.type || param.type === SpecParamType.STRING) {
      // ParamType defaults to STRING
      if (param.options) {
        errors.push(
          `Param${
            param.param ? ` ${param.param}` : ""
          } cannot have options because it is type STRING`
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
          } cannot have validationRegex because it is type ${param.type}`
        );
      }
      if (!param.options) {
        errors.push(
          `Param${param.param ? ` ${param.param}` : ""} requires options because it is type ${
            param.type
          }`
        );
      }
      for (const opt of param.options || []) {
        if (opt.value === undefined) {
          errors.push(
            `Option for param${
              param.param ? ` ${param.param}` : ""
            } is missing required field: value`
          );
        }
      }
    }
    if (param.type && param.type === SpecParamType.SELECTRESOURCE) {
      if (!param.resourceType) {
        errors.push(
          `Param${param.param ? ` ${param.param}` : ""} must have resourceType because it is type ${
            param.type
          }`
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
          "end with a lowercase letter or number, and only contain lowercase letters, numbers, or -"
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
      message: "Enter the GitHub repo URI where this Extension's source code is located:",
    });
    if (!repoRegex.test(extensionRoot)) {
      logger.info("Repo URI must follow this format: https://github.com/<user>/<repo>");
    } else {
      repoIsValid = true;
    }
  }
  return extensionRoot;
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
    options.markdown
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
 * Increments the pre-release annotation of the Extension version if the release stage is not stable.
 * @param ref the ref to the Extension
 * @param extensionVersion the version of the Extension
 * @param stage the stage of this release
 */
export async function incrementPrereleaseVersion(
  ref: string,
  extensionVersion: string,
  stage: ReleaseStage
): Promise<string> {
  if (!stageOptions.includes(stage)) {
    throw new FirebaseError(`--stage flag only supports the following values: ${stageOptions}`);
  }
  if (stage !== "stable") {
    const version = semver.parse(extensionVersion)!;
    if (version.prerelease.length > 0 || version.build.length > 0) {
      throw new FirebaseError(
        `Cannot combine the --stage flag with a version with a prerelease annotation in extension.yaml.`
      );
    }
    let extensionVersions: ExtensionVersion[] = [];
    try {
      extensionVersions = await listExtensionVersions(ref, `id="${version.version}"`, true);
    } catch (e) {
      // Silently fail and continue the publish flow if extension not found.
    }
    const latestVersion =
      extensionVersions
        .map((version) => semver.parse(version.spec.version)!)
        .filter((version) => version.prerelease.length > 0 && version.prerelease[0] === stage)
        .sort((v1, v2) => semver.compare(v1, v2))
        .pop() ?? `${version}-${stage}`;
    return semver.inc(latestVersion, "prerelease", undefined, stage)!;
  }
  return extensionVersion;
}

/**
 * Validates the Extension spec.
 *
 * @param publisherId the ID of the Publisher
 * @param extensionId the ID of the Extension
 * @param rootDirectory the directory with the Extension's source
 * @param latestVersion the latest version of the Extension (if any)
 * @param stage the release stage
 *
 */
async function validateExtensionSpec(args: {
  publisherId: string;
  extensionId: string;
  rootDirectory: string;
  latestVersion?: string;
  stage: ReleaseStage;
}): Promise<{ extensionSpec: ExtensionSpec; notes: string }> {
  const extensionRef = `${args.publisherId}/${args.extensionId}`;
  const extensionSpec = await getLocalExtensionSpec(args.rootDirectory);
  if (extensionSpec.name !== args.extensionId) {
    throw new FirebaseError(
      `Extension ID '${clc.bold(
        args.extensionId
      )}' does not match the name in extension.yaml '${clc.bold(extensionSpec.name)}'.`
    );
  }

  // Substitute deepcopied spec with autopopulated params, and make sure that it passes basic extension.yaml validation.
  const subbedSpec = JSON.parse(JSON.stringify(extensionSpec));
  subbedSpec.params = substituteParams<Param[]>(
    extensionSpec.params || [],
    AUTOPOULATED_PARAM_PLACEHOLDERS
  );
  validateSpec(subbedSpec);

  // Increment the pre-release annotation if it is not a stable version.
  extensionSpec.version = await incrementPrereleaseVersion(
    extensionRef,
    extensionSpec.version,
    args.stage
  );

  let notes: string;
  try {
    const changes = getLocalChangelog(args.rootDirectory);
    notes = changes[extensionSpec.version];
  } catch (err: any) {
    throw new FirebaseError(
      "No CHANGELOG.md file found. " +
        "Please create one and add an entry for this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/alpha/create-user-docs#writing-changelog for more details."
        )
    );
  }
  // Notes are required for all stable versions after the initial release.
  if (!notes && !semver.prerelease(extensionSpec.version) && args.latestVersion) {
    throw new FirebaseError(
      `No entry for version ${extensionSpec.version} found in CHANGELOG.md. ` +
        "Please add one so users know what has changed in this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/alpha/create-user-docs#writing-changelog for more details."
        )
    );
  }

  if (args.latestVersion) {
    if (semver.lt(extensionSpec.version, args.latestVersion)) {
      throw new FirebaseError(
        `The version you are trying to publish (${clc.bold(
          extensionSpec.version
        )}) is lower than the current version (${clc.bold(
          args.latestVersion
        )}) for the extension '${clc.bold(
          extensionRef
        )}'. Please make sure this version is greater than the current version (${clc.bold(
          args.latestVersion
        )}) inside of extension.yaml.\n`,
        { exit: 104 }
      );
    } else if (semver.eq(extensionSpec.version, args.latestVersion)) {
      throw new FirebaseError(
        `The version you are trying to publish (${clc.bold(
          extensionSpec.version
        )}) already exists for Extension '${clc.bold(
          extensionRef
        )}'. Please increment the version inside of extension.yaml.\n`,
        { exit: 103 }
      );
    }
  }

  return { extensionSpec, notes };
}

/**
 * Publishes an Extension version from a remote repo.
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
export async function publishExtensionVersionFromRemoteRepo(args: {
  publisherId: string;
  extensionId: string;
  repoUri: string;
  sourceRef: string;
  extensionRoot: string;
  stage: ReleaseStage;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ExtensionVersion | undefined> {
  const extensionRef = `${args.publisherId}/${args.extensionId}`;

  // Check if Extension already exists.
  let extension: Extension | undefined;
  try {
    extension = await getExtension(extensionRef);
  } catch (err: any) {
    // Silently fail and continue the publish flow if Extension not found.
  }

  // Prompt for repo URI and validate that it hasn't changed if previously set.
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
  if (extension?.repoUri) {
    logger.info(
      `Extension ${clc.bold(extensionRef)} is published from ${clc.bold(
        extension?.repoUri
      )}. Use --repo to change this repo.`
    );
  }

  let extensionRoot = args.extensionRoot;
  let defaultRoot = "/";
  if (!extensionRoot) {
    // Try to get the cached root only if the root hasn't already been passed in.
    if (extension) {
      try {
        const extensionVersionRef = `${extensionRef}@${extension.latestVersion}`;
        const extensionVersion = await getExtensionVersion(extensionVersionRef);
        if (extensionVersion.extensionRoot) {
          defaultRoot = extensionVersion.extensionRoot;
        }
      } catch (err: any) {
        // Not a critical error so continue with default root.
      }
    }
    extensionRoot = defaultRoot;
    if (!args.nonInteractive) {
      extensionRoot = await promptOnce({
        type: "input",
        message:
          "Enter this Extension's root directory in the repo (defaults to previous root if set):",
        default: defaultRoot,
      });
    }
  }

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

  // Prompt for release stage.
  let stage = args.stage;
  const defaultStage = "rc";
  if (!stage) {
    if (!args.nonInteractive) {
      stage = await promptOnce({
        type: "list",
        message: "Choose the release stage (pre-release annotations will be auto-incremented):",
        choices: stageOptions,
        default: defaultStage,
      });
    } else {
      stage = defaultStage;
    }
  }

  // Fetch and validate Extension from remote repo.
  logger.info("Downloading and validating source code...");
  const archiveUri = `${repoUri}/archive/${sourceRef}.zip`;
  const tempDirectory = tmp.dirSync({ unsafeCleanup: true });
  try {
    const response = await fetch(archiveUri);
    if (response.ok) {
      await response.body.pipe(unzipper.Extract({ path: tempDirectory.name })).promise(); // eslint-disable-line new-cap
    }
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to fetch Extension archive ${archiveUri}. Please check the repo URI and source ref. ${err}`
    );
  }
  const archiveName = fs.readdirSync(tempDirectory.name)[0];
  const rootDirectory = path.join(tempDirectory.name, archiveName, extensionRoot);
  // Pre-validation to show a more useful error message in the context of a temp directory.
  try {
    readFile(path.resolve(rootDirectory, EXTENSIONS_SPEC_FILE));
  } catch (err: any) {
    throw new FirebaseError(
      `Failed to find ${clc.bold(EXTENSIONS_SPEC_FILE)} in directory ${clc.bold(
        extensionRoot
      )}. Please verify the root and try again.`
    );
  }
  const { extensionSpec, notes } = await validateExtensionSpec({
    publisherId: args.publisherId,
    extensionId: args.extensionId,
    rootDirectory: rootDirectory,
    latestVersion: extension?.latestVersion,
    stage: stage,
  });

  const sourceUri = path.join(repoUri, "tree", sourceRef, extensionRoot);
  displayReleaseNotes(extensionRef, extensionSpec.version, notes, sourceUri);
  const confirmed = await confirm({
    nonInteractive: args.nonInteractive,
    force: args.force,
    default: false,
  });
  if (!confirmed) {
    return;
  }

  // Publish the Extension version.
  const extensionVersionRef = `${extensionRef}@${extensionSpec.version}`;
  const publishSpinner = ora(`Publishing ${clc.bold(extensionVersionRef)}`);
  let res;
  try {
    publishSpinner.start();
    res = await publishExtensionVersion({
      extensionVersionRef,
      packageUri: "",
      extensionRoot,
      repoUri,
      sourceRef: args.sourceRef,
    });
    publishSpinner.succeed(` Successfully published ${clc.bold(extensionRef)}`);
  } catch (err: any) {
    publishSpinner.fail();
    if (err.status === 404) {
      throw getMissingPublisherError(args.publisherId);
    }
    throw err;
  }
  return res;
}

/**
 * Publishes an Extension version from local source.
 *
 * @param publisherId the ID of the Publisher this Extension will be published under
 * @param extensionId the ID of the Extension to be published
 * @param rootDirectory the root directory that contains this Extension's source
 * @param stage the release stage to publish
 * @param nonInteractive whether to display prompts
 * @param force whether to force confirmations
 */
export async function publishExtensionVersionFromLocalSource(args: {
  publisherId: string;
  extensionId: string;
  rootDirectory: string;
  stage: ReleaseStage;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ExtensionVersion | undefined> {
  let extension;
  try {
    extension = await getExtension(`${args.publisherId}/${args.extensionId}`);
  } catch (err: any) {
    // Silently fail and continue the publish flow if extension not found.
  }

  const { extensionSpec, notes } = await validateExtensionSpec({
    publisherId: args.publisherId,
    extensionId: args.extensionId,
    rootDirectory: args.rootDirectory,
    latestVersion: extension?.latestVersion,
    stage: args.stage,
  });

  const extensionRef = `${args.publisherId}/${args.extensionId}`;
  displayReleaseNotes(extensionRef, extensionSpec.version, notes);
  const confirmed = await confirm({
    nonInteractive: args.nonInteractive,
    force: args.force,
    default: false,
  });
  if (!confirmed) {
    return;
  }

  const extensionVersionRef = `${extensionRef}@${extensionSpec.version}`;
  let packageUri: string;
  let objectPath = "";
  const uploadSpinner = ora(" Archiving and uploading extension source code");
  try {
    uploadSpinner.start();
    objectPath = await archiveAndUploadSource(args.rootDirectory, EXTENSIONS_BUCKET_NAME);
    uploadSpinner.succeed(" Uploaded extension source code");
    packageUri = storageOrigin + objectPath + "?alt=media";
  } catch (err: any) {
    uploadSpinner.fail();
    throw new FirebaseError(`Failed to archive and upload extension source, ${err}`, {
      original: err,
    });
  }
  const publishSpinner = ora(`Publishing ${clc.bold(extensionVersionRef)}`);
  let res;
  try {
    publishSpinner.start();
    res = await publishExtensionVersion({ extensionVersionRef, packageUri });
    publishSpinner.succeed(` Successfully published ${clc.bold(extensionVersionRef)}`);
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

function getMissingPublisherError(publisherId: string): FirebaseError {
  return new FirebaseError(
    marked(
      `Couldn't find publisher ID '${clc.bold(
        publisherId
      )}'. Please ensure that you have registered this ID. To register as a publisher, you can check out the [Firebase documentation](https://firebase.google.com/docs/extensions/alpha/share#register_as_an_extensions_publisher) for step-by-step instructions.`
    )
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
  sourceUri: string
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
      }
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
 * Displays the release notes and confirmation message for an Extension about to be published.
 *
 * @param extensionRef the ref of the Extension being published
 * @param versionId the version ID of the Extension being published
 * @param releaseNotes the release notes for the version being published (if any)
 * @param sourceUri the repo URI + root from which the Extension will be published
 * @param sourceRef the source ref in the repo from which the Extension will be published
 */
export function displayReleaseNotes(
  extensionRef: string,
  versionId: string,
  releaseNotes?: string,
  sourceUri?: string
): void {
  const source = sourceUri || "local source";
  const releaseNotesMessage = releaseNotes
    ? `${clc.bold("Release notes:")}\n${marked(releaseNotes)}`
    : "";
  const metadataMessage =
    `${clc.bold("Extension:")} ${extensionRef}\n` +
    `${clc.bold("Version:")} ${clc.bold(clc.green(versionId))}\n` +
    `${clc.bold("Source:")} ${source}\n`;
  const message =
    `\nYou are about to publish a new version to Firebase's registry of Extensions.\n\n` +
    metadataMessage +
    releaseNotesMessage +
    `\nOnce an Extension version is published, it cannot be changed. If you wish to make changes after publishing, you will need to publish a new version.\n`;
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
  extensionName: string
): Promise<"updateExisting" | "installNew" | "cancel"> {
  const message = `An extension with the ID '${clc.bold(
    extensionName
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
      sourceOrVersion
    )}'. Check to make sure the source is correct, and then please try again.`
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

/**
 * Canonicalize a user-inputted ref string.
 * 1. Infer firebase publisher if not provided
 * 2. Infer "latest" as the version if not provided
 */
export async function canonicalizeRefInput(refInput: string): Promise<string> {
  let inferredRef = refInput;
  // Infer 'firebase' if publisher ID not provided.
  if (refInput.split("/").length < 2) {
    inferredRef = `firebase/${inferredRef}`;
  }
  // Infer 'latest' if no version provided.
  if (refInput.split("@").length < 2) {
    inferredRef = `${inferredRef}@latest`;
  }
  // Get the correct version for a given extension reference from the Registry API.
  const ref = refs.parse(inferredRef);
  ref.version = await resolveVersion(ref);
  return refs.toExtensionVersionRef(ref);
}
