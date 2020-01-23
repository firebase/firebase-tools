import * as _ from "lodash";

import { convertOfficialExtensionsToList } from "./utils";
import { getFirebaseConfig } from "../functionsConfig";
import { getExtensionRegistry } from "./resolveSource";
import { FirebaseError } from "../error";
import { checkResponse } from "./askUserForParam";
import { ensure } from "../ensureApiEnabled";
import * as extensionsApi from "./extensionsApi";
import * as getProjectId from "../getProjectId";
import { Param } from "./extensionsApi";
import { promptOnce } from "../prompt";
import * as logger from "../logger";

export const logPrefix = "extensions";

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
export function validateCommandLineParams(envVars: any, paramSpec: any): void {
  if (_.size(envVars) < _.size(paramSpec)) {
    throw new FirebaseError(
      "A param is missing from the passed in .env file." +
        "Please check to see that all variables are set before installing again."
    );
  }
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

  // TODO: validate command line params for select/multiselect
  _.forEach(paramSpec, (param) => {
    // Warns if invalid response was found in environment file.
    if (!checkResponse(envVars[param.param], param)) {
      throw new FirebaseError(
        `${param.param} is not valid for the reason listed above. Please set a valid value` +
          " before installing again."
      );
    }
  });
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
 * Display list of all official extensions and prompt user to select one.
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
  const instanceRes = await extensionsApi.getInstance(projectId, instanceId, {
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
