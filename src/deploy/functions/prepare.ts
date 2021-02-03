import * as clc from "cli-color";

import { ensure, check } from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import { logBullet } from "../../utils";
import { getRuntimeChoice } from "../../parseRuntimeAndValidateSDK";
import { functionMatchesAnyGroup, getFilterGroups } from "../../functionsDeployHelper";
import { CloudFunctionTrigger, functionsByRegion, allFunctions } from "./deploymentPlanner";
import { promptForFailurePolicies } from "./prompts";
import { prepareFunctionsUpload } from "../../prepareFunctionsUpload";

import * as validate from "./validate";
import { checkRuntimeDependencies } from "./checkRuntimeDependencies";

export async function prepare(context: any, options: any, payload: any): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const sourceDirName = options.config.get("functions.source");
  const sourceDir = options.config.path(sourceDirName);
  const projectDir = options.config.projectDir;
  const projectId = getProjectId(options);

  // Check what runtime to use, first in firebase.json, then in 'engines' field.
  const runtimeFromConfig = options.config.get("functions.runtime");
  context.runtimeChoice = getRuntimeChoice(sourceDir, runtimeFromConfig);

  // Check that all necessary APIs are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensure(options.project, "cloudfunctions.googleapis.com", "functions"),
    check(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true),
    checkRuntimeDependencies(projectId, context.runtimeChoice),
  ]);
  context.runtimeConfigEnabled = checkAPIsEnabled[1];

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;

  // Prepare the functions directory for upload, and set context.triggers.
  logBullet(
    clc.cyan.bold("functions:") +
      " preparing " +
      clc.bold(options.config.get("functions.source")) +
      " directory for uploading..."
  );
  const source = await prepareFunctionsUpload(context, options);
  context.functionsSource = source;

  // Get a list of CloudFunctionTriggers, and set default environment variables on each.
  const defaultEnvVariables = {
    FIREBASE_CONFIG: JSON.stringify(context.firebaseConfig),
  };
  const functions = options.config.get("functions.triggers");
  functions.forEach((fn: CloudFunctionTrigger) => {
    fn.environmentVariables = defaultEnvVariables;
  });

  // Check if we are deploying any scheduled functions - if so, check the necessary APIs.
  const includesScheduledFunctions = functions.some((fn: CloudFunctionTrigger) => fn.schedule);
  if (includesScheduledFunctions) {
    await Promise.all([
      ensure(projectId, "cloudscheduler.googleapis.com", "scheduler", false),
      ensure(projectId, "pubsub.googleapis.com", "pubsub", false),
    ]);
  }

  // Build a regionMap, and duplicate functions for each region they are being deployed to.
  payload.functions = {};
  // TODO: Make byRegion an implementation detail of deploymentPlanner
  // and only store a flat array of Functions in payload.
  payload.functions.byRegion = functionsByRegion(projectId, functions);
  payload.functions.triggers = allFunctions(payload.functions.byRegion);

  // Validate the function code that is being deployed.
  validate.functionsDirectoryExists(options, sourceDirName);
  // validate.functionNamesAreValid(payload.functionNames);
  // TODO: This doesn't do anything meaningful right now because payload.functions is not defined
  validate.packageJsonIsValid(sourceDirName, sourceDir, projectDir, !!runtimeFromConfig);

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  // Display a warning and prompt if any functions in the release have failurePolicies.
  const localFnsInRelease = payload.functions.triggers.filter((fn: CloudFunctionTrigger) => {
    return functionMatchesAnyGroup(fn.name, context.filters);
  });
  await promptForFailurePolicies(options, localFnsInRelease);
}
