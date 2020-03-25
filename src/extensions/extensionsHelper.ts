import * as _ from "lodash";
import * as ora from "ora";

import { firebaseStorageOrigin } from "../api";
import { archiveDirectory } from "../archiveDirectory";
import { convertOfficialExtensionsToList } from "./utils";
import { getFirebaseConfig } from "../functionsConfig";
import { getExtensionRegistry, resolveSourceUrl, resolveRegistryEntry } from "./resolveSource";
import { FirebaseError } from "../error";
import { checkResponse } from "./askUserForParam";
import { ensure } from "../ensureApiEnabled";
import { deleteObject, uploadObject } from "../gcp/storage";
import * as getProjectId from "../getProjectId";
import {
  createSource,
  getInstance,
  ExtensionSource,
  ExtensionSpec,
  getSource,
  Param,
  ParamType,
} from "./extensionsApi";
import { promptOnce } from "../prompt";
import * as logger from "../logger";
import { envOverride } from "../utils";

/**
 * SpecParamType represents the exact strings that the extensions
 * backend expects for each param type in the extensionYaml.
 * This DOES NOT represent the param.type strings that the backend returns in spec.
 * ParamType, defined in extensionsApi.ts, describes the returned strings.
 */
export enum SpecParamType {
  SELECT = "select",
  MULTISELECT = "multiselect",
  STRING = "string",
}

export const logPrefix = "extensions";
const urlRegex = /^http[s]?:\/\/.*\.zip$/;
export const EXTENSIONS_BUCKET_NAME = envOverride(
  "FIREBASE_EXTENSIONS_UPLOAD_BUCKET",
  "firebase-ext-eap-uploads"
);

export const resourceTypeToNiceName: { [key: string]: string } = {
  "firebaseextensions.v1beta.scheduledFunction": "Scheduled Function",
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
 * (e.g If the original object contains `path/${FOO}` and the param FOO has the value of "bar",
 * then it will become `path/bar`)
 * @param original Object containing strings that have placeholders that look like`${}`
 * @param params params to substitute the placeholders for
 * @return Resources object with substituted params
 */
export function substituteParams(original: object[], params: { [key: string]: string }): Param[] {
  const startingString = JSON.stringify(original);
  const reduceFunction = (intermediateResult: string, paramVal: string, paramKey: string) => {
    const regex = new RegExp("\\$\\{" + paramKey + "\\}", "g");
    return intermediateResult.replace(regex, paramVal);
  };
  return JSON.parse(_.reduce(params, reduceFunction, startingString));
}

/**
 * Sets params equal to defaults given in extension.yaml if not already set in .env file.
 * @param paramVars JSON object of params to values parsed from .env file
 * @param spec information on params parsed from extension.yaml
 * @return JSON object of params
 */
export function populateDefaultParams(paramVars: any, paramSpec: any): any {
  const newParams = paramVars;

  _.forEach(paramSpec, (env) => {
    if (!paramVars[env.param]) {
      if (env.default) {
        newParams[env.param] = env.default;
      } else {
        throw new FirebaseError(
          `${env.param} has not been set in the given params file` +
            " and there is no default available. Please set this variable before installing again."
        );
      }
    }
  });

  return newParams;
}

/**
 * Validates command-line params supplied by developer.
 * @param envVars JSON object of params to values parsed from .env file
 * @param paramSpec information on params parsed from extension.yaml
 */
export function validateCommandLineParams(
  envVars: { [key: string]: string },
  paramSpec: any[]
): void {
  if (_.size(envVars) > _.size(paramSpec)) {
    const paramList = _.map(paramSpec, (param) => {
      return param.param;
    });
    const misnamedParams = Object.keys(envVars).filter((key: any) => {
      return paramList.indexOf(key) === -1;
    });
    logger.info(
      "Warning: The following params were specified in your env file but do not exist in the extension spec: " +
        `${misnamedParams.join(", ")}.`
    );
  }
  let allParamsValid = true;
  _.forEach(paramSpec, (param) => {
    // Warns if invalid response was found in environment file.
    if (!checkResponse(envVars[param.param], param)) {
      allParamsValid = false;
    }
  });
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
    errors.push("extension.yaml; is missing required field: version");
  }
  for (let resource of spec.resources) {
    if (!resource.name) {
      errors.push("Resource is missing required field: name");
    }
    if (!resource.type) {
      errors.push(
        `Resource${resource.name ? ` ${resource.name}` : ""} is missing required field: type`
      );
    }
  }
  for (let api of spec.apis || []) {
    if (!api.apiName) {
      errors.push("API is missing required field: apiName");
    }
  }
  for (let role of spec.roles || []) {
    if (!role.role) {
      errors.push("Role is missing required field: role");
    }
  }
  for (let param of spec.params || []) {
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
        }. Valid types are ${_.values(ParamType).join(", ")}`
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
      if (
        param.default &&
        param.validationRegex &&
        !RegExp(param.validationRegex).test(param.default)
      ) {
        errors.push(
          `Param${param.param ? ` ${param.param}` : ""} has default value '${
            param.default
          }', which does not pass the validationRegex ${param.validationRegex}`
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
      for (let opt of param.options || []) {
        if (opt.value == undefined) {
          errors.push(
            `Option for param${
              param.param ? ` ${param.param}` : ""
            } is missing required field: value`
          );
        }
      }
    }
  }
  if (errors.length) {
    const message = `The extension.yaml has the following errors: \n${errors.join("\n")}`;
    throw new FirebaseError(message);
  }
}

export async function promptForValidInstanceId(instanceId: string): Promise<string> {
  let instanceIdIsValid = false;
  let newInstanceId;
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
  const projectId = getProjectId(options);
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
 * @returns the path where the source was uploaded to
 */
async function archiveAndUploadSource(extPath: string, bucketName: string): Promise<string> {
  const zippedSource = await archiveDirectory(extPath, { type: "zip", ignore: ["node_modules"] });
  return await uploadObject(zippedSource, bucketName);
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
  if (!urlRegex.test(sourceUri)) {
    const uploadSpinner = ora.default(" Archiving and uploading extension source code");
    try {
      uploadSpinner.start();
      objectPath = await archiveAndUploadSource(sourceUri, EXTENSIONS_BUCKET_NAME);
      uploadSpinner.succeed(" Uploaded extension source code");
      packageUri = firebaseStorageOrigin + objectPath + "?alt=media";
      extensionRoot = "/";
    } catch (err) {
      uploadSpinner.fail();
      throw err;
    }
  } else {
    [packageUri, extensionRoot] = sourceUri.split("#");
  }
  const res = await createSource(projectId, packageUri, extensionRoot);
  // if we uploaded an object, delete it
  if (objectPath.length) {
    try {
      await deleteObject(objectPath);
      logger.debug("Cleaned up uploaded source archive");
    } catch (err) {
      logger.debug("Unable to clean up uploaded source archive");
    }
  }
  return res;
}

/**
 * Looks up a ExtensionSource from a extensionName. If no source exists for that extensionName, returns undefined.
 * @param extensionName a official extension source name
 *                      or a One-Platform format source name (/project/<projectName>/sources/<sourceId>)
 * @returns an ExtensionSource corresponding to extensionName if one exists, undefined otherwise
 */
export async function getExtensionSourceFromName(extensionName: string): Promise<ExtensionSource> {
  const officialExtensionRegex = /^[a-zA-Z\-]+[0-9@.]*$/;
  const existingSourceRegex = /projects\/.+\/sources\/.+/;
  // if the provided extensionName contains only letters and hyphens, assume it is an official extension
  if (officialExtensionRegex.test(extensionName)) {
    const [name, version] = extensionName.split("@");
    const registryEntry = await resolveRegistryEntry(name);
    const sourceUrl = await resolveSourceUrl(registryEntry, name, version);
    return await getSource(sourceUrl);
  } else if (existingSourceRegex.test(extensionName)) {
    logger.info(`Fetching the source "${extensionName}"...`);
    return await getSource(extensionName);
  }
  throw new FirebaseError(`Could not find an extension named '${extensionName}'. `);
}

/* Display list of all official extensions and prompt user to select one.
 * @param message The prompt message to display
 * @returns Promise that resolves to the extension name (e.g. storage-resize-images)
 */
export async function promptForOfficialExtension(message: string): Promise<string> {
  const officialExts = await getExtensionRegistry();
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
): Promise<string> {
  const message =
    `An extension with the ID ${extensionName} already exists in the project ${projectName}.\n` +
    `Do you want to proceed with installing another instance of ${extensionName} in this project?`;
  return await promptOnce({
    type: "confirm",
    message,
  });
}

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
