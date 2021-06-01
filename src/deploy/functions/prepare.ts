import * as clc from "cli-color";

import { checkRuntimeDependencies } from "./checkRuntimeDependencies";
import { FirebaseError } from "../../error";
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { getRuntimeChoice } from "./parseRuntimeAndValidateSDK";
import { prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import { logBullet } from "../../utils";
import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import * as validate from "./validate";
import { Options } from "../../options";

export async function prepare(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  if (!options.config.has("functions")) {
    return;
  }

  const sourceDirName = options.config.get("functions.source") as string;
  if (!sourceDirName) {
    throw new FirebaseError(
      `No functions code detected at default location (./functions), and no functions.source defined in firebase.json`
    );
  }
  const sourceDir = options.config.path(sourceDirName);
  const projectDir = options.config.projectDir;
  const projectId = getProjectId(options);

  // Check what runtime to use, first in firebase.json, then in 'engines' field.
  const runtimeFromConfig = (options.config.get("functions.runtime") as backend.Runtime) || "";
  context.runtimeChoice = getRuntimeChoice(sourceDir, runtimeFromConfig);

  // Check that all necessary APIs are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensureApiEnabled.ensure(projectId, "cloudfunctions.googleapis.com", "functions"),
    ensureApiEnabled.check(
      projectId,
      "runtimeconfig.googleapis.com",
      "runtimeconfig",
      /* silent=*/ true
    ),
    checkRuntimeDependencies(projectId, context.runtimeChoice!),
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
  context.functionsSource = await prepareFunctionsUpload(context, options);

  // Get a list of CloudFunctionTriggers.
  const wantBackend = options.config.get("functions.backend") as backend.Backend;
  // Setup default environment variables on each function.
  wantBackend.cloudFunctions.forEach((fn: backend.FunctionSpec) => {
    fn.environmentVariables = wantBackend.environmentVariables;
  });

  // Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
  // require cloudscheudler and, in v1, require pub/sub), or can eventually come from
  // explicit dependencies.
  await Promise.all(
    Object.keys(wantBackend.requiredAPIs).map((friendlyName) => {
      ensureApiEnabled.ensure(
        projectId,
        wantBackend.requiredAPIs[friendlyName],
        friendlyName,
        /* silent=*/ false
      );
    })
  );

  // Build a regionMap, and duplicate functions for each region they are being deployed to.
  payload.functions = {
    backend: wantBackend,
  };

  // Validate the function code that is being deployed.
  validate.functionsDirectoryExists(options, sourceDirName);
  validate.functionIdsAreValid(wantBackend.cloudFunctions);
  validate.packageJsonIsValid(sourceDirName, sourceDir, projectDir, !!runtimeFromConfig);

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  // Display a warning and prompt if any functions in the release have failurePolicies.
  const wantFunctions = wantBackend.cloudFunctions.filter((fn: backend.FunctionSpec) => {
    return functionMatchesAnyGroup(fn, context.filters);
  });
  const haveFunctions = (await backend.existingBackend(context)).cloudFunctions;
  await promptForFailurePolicies(options, wantFunctions, haveFunctions);
  await promptForMinInstances(options, wantFunctions, haveFunctions);

  await backend.checkAvailability(context, wantBackend);
}
