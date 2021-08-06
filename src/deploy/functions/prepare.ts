import * as clc from "cli-color";

import { Options } from "../../options";
import { ensureCloudBuildEnabled } from "./ensureCloudBuildEnabled";
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { logBullet } from "../../utils";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { previews } from "../../previews";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import { needProjectId } from "../../projectUtils";
import * as runtimes from "./runtimes";
import * as validate from "./validate";
import * as utils from "../../utils";
import { logger } from "../../logger";

function getEnvs(options: {
  firebaseConfig: { [key: string]: any };
  functionsSource: string;
  projectId: string;
  projectAlias?: string;
}): Record<string, string> {
  const { firebaseConfig, functionsSource, projectId, projectAlias } = options;

  let envs = {
    FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
    GCLOUD_PROJECT: projectId,
  };
  if (previews.dotenv) {
    envs = {
      ...functionsEnv.load({
        functionsSource,
        projectId,
        projectAlias,
      }),
      ...envs,
    };
  }
  return envs;
}

/**
 *
 */
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

  const projectId = needProjectId(options);

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

  utils.assertDefined(
    options.config.src.functions.source,
    "Error: 'functions.source' is not defined"
  );
  const source = options.config.src.functions.source;
  const envs = getEnvs({
    firebaseConfig: runtimeConfig,
    functionsSource: options.config.path(source),
    projectId: projectId,
    projectAlias: options.projectAlias,
  });

  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
  const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, envs);
  payload.functions = { backend: wantBackend };
  if (backend.isEmptyBackend(wantBackend)) {
    return;
  }

  // NOTE: this will eventually be enalbed for everyone once AR is enabled
  // for GCFv1
  if (wantBackend.cloudFunctions.find((f) => f.platform === "gcfv2")) {
    await ensureApiEnabled.ensure(
      context.projectId,
      "artifactregistry.googleapis.com",
      "artifactregistry"
    );
  }

  logBullet(
    clc.cyan.bold("functions:") +
      " preparing " +
      clc.bold(options.config.src.functions.source) +
      " directory for uploading..."
  );
  if (wantBackend.cloudFunctions.find((fn) => fn.platform === "gcfv1")) {
    context.functionsSourceV1 = await prepareFunctionsUpload(runtimeConfig, options);
  }
  if (wantBackend.cloudFunctions.find((fn) => fn.platform === "gcfv2")) {
    context.functionsSourceV2 = await prepareFunctionsUpload(
      /* runtimeConfig= */ undefined,
      options
    );
  }

  // Setup environment variables on each function.
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

  // Validate the function code that is being deployed.
  validate.functionIdsAreValid(wantBackend.cloudFunctions);

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  const wantFunctions = wantBackend.cloudFunctions.filter((fn: backend.FunctionSpec) => {
    return functionMatchesAnyGroup(fn, context.filters);
  });
  const haveFunctions = (await backend.existingBackend(context)).cloudFunctions;
  // Display a warning and prompt if any functions in the release have failurePolicies.
  await promptForFailurePolicies(options, wantFunctions, haveFunctions);
  await promptForMinInstances(options, wantFunctions, haveFunctions);
  await backend.checkAvailability(context, wantBackend);
}
