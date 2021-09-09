import * as _ from "lodash";
import * as clc from "cli-color";
import * as ora from "ora";
import * as semver from "semver";
import * as marked from "marked";

const TerminalRenderer = require("marked-terminal");
marked.setOptions({
  renderer: new TerminalRenderer(),
});

import { storageOrigin } from "../api";
import { archiveDirectory } from "../archiveDirectory";
import { convertOfficialExtensionsToList } from "./utils";
import { getFirebaseConfig } from "../functionsConfig";
import { getExtensionRegistry, resolveSourceUrl, resolveRegistryEntry } from "./resolveSource";
import { FirebaseError } from "../error";
import { checkResponse } from "./askUserForParam";
import { ensure } from "../ensureApiEnabled";
import { deleteObject, uploadObject } from "../gcp/storage";
import { needProjectId } from "../projectUtils";
import {
  createSource,
  ExtensionSource,
  ExtensionVersion,
  getExtension,
  getInstance,
  getSource,
  Param,
  parseRef,
  publishExtensionVersion,
} from "./extensionsApi";
import { getLocalExtensionSpec } from "./localHelper";
import { promptOnce } from "../prompt";
import { logger } from "../logger";
import { envOverride } from "../utils";
import { getLocalChangelog, parseChangelog } from "./changelog";
import { utils } from "mocha";

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

/**
 * Turns database URLs (e.g. https://my-db.firebaseio.com) into database instance names
 * (e.g. my-db), which can be used in a function trigger.
 * @param databaseUrl Fully qualified realtime database URL
 */
export function getDBInstanceFromURL(databaseUrl = ""): string {
  const instanceRegex = new RegExp("(?:https://)(.*)(?:.firebaseio.com)");
  const matches = databaseUrl.match(instanceRegex);
  if (matches && matches.length > 1) {
    return matches[1];
  }
  return "";
}

/**
 * Gets Firebase project specific param values.
 */
export async function getFirebaseProjectParams(projectId: string): Promise<any> {
  const body = await getFirebaseConfig({ project: projectId });

  // This env variable is needed for parameter-less initialization of firebase-admin
  const FIREBASE_CONFIG = JSON.stringify({
    projectId: body.projectId,
    databaseURL: body.databaseURL,
    storageBucket: body.storageBucket,
  });

  return {
    PROJECT_ID: body.projectId,
    DATABASE_URL: body.databaseURL,
    STORAGE_BUCKET: body.storageBucket,
    FIREBASE_CONFIG,
    DATABASE_INSTANCE: getDBInstanceFromURL(body.databaseURL),
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
    return _.reduce(regexes, substituteRegexMatches, str);
  };
  return JSON.parse(_.reduce(params, applySubstitution, startingString));
}

/**
 * Sets params equal to defaults given in extension.yaml if not already set in .env file.
 *
 * @param paramVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 * @return JSON object of params
 */
export function populateDefaultParams(paramVars: Record<string, string>, paramSpecs: Param[]): any {
  const newParams = paramVars;

  for (const param of paramSpecs) {
    if (!paramVars[param.param]) {
      if (param.default != undefined) {
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
    if (param.type && !_.includes(SpecParamType, param.type)) {
      errors.push(
        `Invalid type ${param.type} for param${
          param.param ? ` ${param.param}` : ""
        }. Valid types are ${_.values(SpecParamType).join(", ")}`
      );
    }
    if (!param.type || param.type == SpecParamType.STRING) {
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
      (param.type == SpecParamType.SELECT || param.type == SpecParamType.MULTISELECT)
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
        if (opt.value == undefined) {
          errors.push(
            `Option for param${
              param.param ? ` ${param.param}` : ""
            } is missing required field: value`
          );
        }
      }
    }
    if (param.type && param.type == SpecParamType.SELECTRESOURCE) {
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

export async function ensureExtensionsApiEnabled(options: any): Promise<void> {
  const projectId = needProjectId(options);
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
 *
 * @param publisherId the publisher profile to publish this extension under.
 * @param extensionId the ID of the extension. This must match the `name` field of extension.yaml.
 * @param rootDirectory the directory containing  extension.yaml
 */
export async function publishExtensionVersionFromLocalSource(args: {
  publisherId: string;
  extensionId: string;
  rootDirectory: string;
  nonInteractive: boolean;
  force: boolean;
}): Promise<ExtensionVersion | undefined> {
  const extensionSpec = await getLocalExtensionSpec(args.rootDirectory);
  if (extensionSpec.name != args.extensionId) {
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

  let extension;
  try {
    extension = await getExtension(`${args.publisherId}/${args.extensionId}`);
  } catch (err) {
    // Silently fail and continue the publish flow if extension not found.
  }

  let notes: string;
  try {
    const changes = getLocalChangelog(args.rootDirectory);
    notes = changes[extensionSpec.version];
  } catch (err) {
    throw new FirebaseError(
      "No CHANGELOG.md file found. " +
        "Please create one and add an entry for this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/alpha/create-user-docs#writing-changelog for more details."
        )
    );
  }
  if (!notes && extension) {
    // If this is not the first version of this extension, we require release notes
    throw new FirebaseError(
      `No entry for version ${extensionSpec.version} found in CHANGELOG.md. ` +
        "Please add one so users know what has changed in this version. " +
        marked(
          "See https://firebase.google.com/docs/extensions/alpha/create-user-docs#writing-changelog for more details."
        )
    );
  }
  displayReleaseNotes(args.publisherId, args.extensionId, extensionSpec.version, notes);
  if (
    !(await confirm({
      nonInteractive: args.nonInteractive,
      force: args.force,
      default: false,
    }))
  ) {
    return;
  }

  if (
    extension &&
    extension.latestVersion &&
    semver.lt(extensionSpec.version, extension.latestVersion)
  ) {
    // publisher's version is less than current latest version.
    throw new FirebaseError(
      `The version you are trying to publish (${clc.bold(
        extensionSpec.version
      )}) is lower than the current version (${clc.bold(
        extension.latestVersion
      )}) for the extension '${clc.bold(
        `${args.publisherId}/${args.extensionId}`
      )}'. Please make sure this version is greater than the current version (${clc.bold(
        extension.latestVersion
      )}) inside of extension.yaml.\n`
    );
  } else if (
    extension &&
    extension.latestVersion &&
    semver.eq(extensionSpec.version, extension.latestVersion)
  ) {
    // publisher's version is equal to the current latest version.
    throw new FirebaseError(
      `The version you are trying to publish (${clc.bold(
        extensionSpec.version
      )}) already exists for the extension '${clc.bold(
        `${args.publisherId}/${args.extensionId}`
      )}'. Please increment the version inside of extension.yaml.\n`
    );
  }

  const ref = `${args.publisherId}/${args.extensionId}@${extensionSpec.version}`;
  let packageUri: string;
  let objectPath = "";
  const uploadSpinner = ora.default(" Archiving and uploading extension source code");
  try {
    uploadSpinner.start();
    objectPath = await archiveAndUploadSource(args.rootDirectory, EXTENSIONS_BUCKET_NAME);
    uploadSpinner.succeed(" Uploaded extension source code");
    packageUri = storageOrigin + objectPath + "?alt=media";
  } catch (err) {
    uploadSpinner.fail();
    throw err;
  }
  const publishSpinner = ora.default(`Publishing ${clc.bold(ref)}`);
  let res;
  try {
    publishSpinner.start();
    res = await publishExtensionVersion(ref, packageUri);
    publishSpinner.succeed(` Successfully published ${clc.bold(ref)}`);
  } catch (err) {
    publishSpinner.fail();
    if (err.status == 404) {
      throw new FirebaseError(
        marked(
          `Couldn't find publisher ID '${clc.bold(
            args.publisherId
          )}'. Please ensure that you have registered this ID. To register as a publisher, you can check out the [Firebase documentation](https://firebase.google.com/docs/extensions/alpha/share#register_as_an_extensions_publisher) for step-by-step instructions.`
        )
      );
    }
    throw err;
  }
  await deleteUploadedSource(objectPath);
  return res;
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
  let packageUri: string;
  let extensionRoot: string;
  let objectPath = "";
  if (!URL_REGEX.test(sourceUri)) {
    const uploadSpinner = ora.default(" Archiving and uploading extension source code");
    try {
      uploadSpinner.start();
      objectPath = await archiveAndUploadSource(sourceUri, EXTENSIONS_BUCKET_NAME);
      uploadSpinner.succeed(" Uploaded extension source code");
      packageUri = storageOrigin + objectPath + "?alt=media";
      extensionRoot = "/";
    } catch (err) {
      uploadSpinner.fail();
      throw err;
    }
  } else {
    [packageUri, extensionRoot] = sourceUri.split("#");
  }
  const res = await createSource(projectId, packageUri, extensionRoot);
  logger.debug("Created new Extension Source %s", res.name);
  // if we uploaded an object, delete it
  await deleteUploadedSource(objectPath);
  return res;
}

/**
 * Cleans up uploaded ZIP file after creating an extension source or publishing an extension version.
 */
async function deleteUploadedSource(objectPath: string) {
  if (objectPath.length) {
    try {
      await deleteObject(objectPath);
      logger.debug("Cleaned up uploaded source archive");
    } catch (err) {
      logger.debug("Unable to clean up uploaded source archive");
    }
  }
}

/**
 * Looks up a ExtensionSource from a extensionName. If no source exists for that extensionName, returns undefined.
 * @param extensionName a official extension source name
 *                      or a One-Platform format source name (/project/<projectName>/sources/<sourceId>)
 * @return an ExtensionSource corresponding to extensionName if one exists, undefined otherwise
 */
export async function getExtensionSourceFromName(extensionName: string): Promise<ExtensionSource> {
  const officialExtensionRegex = /^[a-zA-Z\-]+[0-9@.]*$/;
  const existingSourceRegex = /projects\/.+\/sources\/.+/;
  // if the provided extensionName contains only letters and hyphens, assume it is an official extension
  if (officialExtensionRegex.test(extensionName)) {
    const [name, version] = extensionName.split("@");
    const registryEntry = await resolveRegistryEntry(name);
    const sourceUrl = resolveSourceUrl(registryEntry, name, version);
    return await getSource(sourceUrl);
  } else if (existingSourceRegex.test(extensionName)) {
    logger.info(`Fetching the source "${extensionName}"...`);
    return await getSource(extensionName);
  }
  throw new FirebaseError(`Could not find an extension named '${extensionName}'. `);
}

/**
 * Confirm the version number in extension.yaml with the user .
 *
 * @param publisherId the publisher ID of the extension being installed
 * @param extensionId the extension ID of the extension being installed
 * @param versionId the version ID of the extension being installed
 */
export function displayReleaseNotes(
  publisherId: string,
  extensionId: string,
  versionId: string,
  releaseNotes?: string
): void {
  const releaseNotesMessage = releaseNotes
    ? ` Release notes for this version:\n${marked(releaseNotes)}\n`
    : "\n";
  const message =
    `You are about to publish version ${clc.green(versionId)} of ${clc.green(
      `${publisherId}/${extensionId}`
    )} to Firebase's registry of extensions.${releaseNotesMessage}` +
    "Once an extension version is published, it cannot be changed. If you wish to make changes after publishing, you will need to publish a new version.\n\n";
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
    pageSize: _.size(officialExts),
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
  const instanceRes = await getInstance(projectId, instanceId, {
    resolveOnHTTPError: true,
  });
  if (instanceRes.error) {
    if (_.get(instanceRes, "error.code") === 404) {
      return false;
    }
    const msg =
      "Unexpected error when checking if instance ID exists: " +
      _.get(instanceRes, "error.message");
    throw new FirebaseError(msg, {
      original: instanceRes.error,
    });
  }
  return true;
}

export function isUrlPath(extInstallPath: string): boolean {
  return URL_REGEX.test(extInstallPath);
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
      ref = parseRef(sourceOrVersion);
    } catch (err) {
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

/**
 * Confirm if the user wants to continue
 */
export async function confirm(args: {
  nonInteractive?: boolean;
  force?: boolean;
  default?: boolean;
}): Promise<boolean> {
  if (!args.nonInteractive && !args.force) {
    const message = `Do you wish to continue?`;
    return await promptOnce({
      type: "confirm",
      message,
      default: args.default,
    });
  } else if (args.nonInteractive && !args.force) {
    throw new FirebaseError("Pass the --force flag to use this command in non-interactive mode");
  } else {
    return true;
  }
}
