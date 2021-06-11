import * as clc from "cli-color";

import { Options } from "../../options";
import { ensureCloudBuildEnabled } from "./ensureCloudBuildEnabled";
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { logBullet } from "../../utils";
import { getFunctionsConfig, getEnvs, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as getProjectId from "../../getProjectId";
import * as runtimes from "./runtimes";
import * as validate from "./validate";
import * as utils from "../../utils";
import { logger } from "../../logger";

export async function prepare(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  if (!options.config.src.functions) {
    return;
  }

  const runtimeDelegate = await runtimes.getRuntimeDelegate(context, options);
  logger.debug(`Validating ${runtimeDelegate.name} source`);
  await runtimeDelegate.validate();
  logger.debug(`Building ${runtimeDelegate.name} source`);
  await runtimeDelegate.build();

  const projectId = getProjectId(options);

  // Check that all necessary APIs are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensureApiEnabled.ensure(projectId, "cloudfunctions.googleapis.com", "functions"),
    ensureApiEnabled.check(
      projectId,
      "runtimeconfig.googleapis.com",
      "runtimeconfig",
      /* silent=*/ true
    ),
    ensureCloudBuildEnabled(projectId),
  ]);
  context.runtimeConfigEnabled = checkAPIsEnabled[1];

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;
  const runtimeConfig = await getFunctionsConfig(context);
  const env = await getEnvs(context);

  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
  const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, env);
  options.config.set("functions.backend", wantBackend);
  if (backend.isEmptyBackend(wantBackend)) {
    return;
  }

  // Prepare the functions directory for upload, and set context.triggers.
  utils.assertDefined(
    options.config.src.functions.source,
    "Error: 'functions.source' is not defined"
  );
  logBullet(
    clc.cyan.bold("functions:") +
      " preparing " +
      clc.bold(options.config.src.functions.source) +
      " directory for uploading..."
  );
  context.functionsSource = await prepareFunctionsUpload(runtimeConfig, options);

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
  validate.functionIdsAreValid(wantBackend.cloudFunctions);

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
