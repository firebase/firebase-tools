import * as clc from "cli-color";

import { logBullet } from "../../utils";
import { getRuntimeChoice } from "./parseRuntimeAndValidateSDK";
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { promptForFailurePolicies } from "./prompts";
import { prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { checkRuntimeDependencies } from "./checkRuntimeDependencies";
import { FirebaseError } from "../../error";
import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import * as validate from "./validate";

export async function prepare(
  context: args.Context,
  options: args.Options,
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
  const source = await prepareFunctionsUpload(context, options);
  context.functionsSource = source;

  // Get a list of CloudFunctionTriggers, and set default environment variables on each.
  // Note(inlined): why couldn't the backend have been populated with environment variables from
  // the beginning? Does this mean that we're using different environment variables for discovery
  // vs runtime or just that we have redundant logic.
  // It's probably the latter just because we don't yet support arbitrary env.
  const defaultEnvVariables = {
    FIREBASE_CONFIG: JSON.stringify(context.firebaseConfig),
  };
  const wantBackend = options.config.get("functions.backend") as backend.Backend;
  wantBackend.cloudFunctions.forEach((fn: backend.FunctionSpec) => {
    fn.environmentVariables = defaultEnvVariables;
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

  await backend.checkAvailability(context, wantBackend);
}
