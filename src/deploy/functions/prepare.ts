import * as clc from "cli-color";

import { Options } from "../../options";
import { ensureCloudBuildEnabled } from "./ensureCloudBuildEnabled";
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { logBullet } from "../../utils";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import { previews } from "../../previews";
import { needProjectId } from "../../projectUtils";
import { track } from "../../track";
import * as runtimes from "./runtimes";
import * as validate from "./validate";
import * as utils from "../../utils";
import { logger } from "../../logger";

function hasUserConfig(config: Record<string, unknown>): boolean {
  // "firebase" key is always going to exist in runtime config.
  // If any other key exists, we can assume that user is using runtime config.
  return Object.keys(config).length > 1;
}

function hasDotenv(opts: functionsEnv.UserEnvsOpts): boolean {
  return previews.dotenv && functionsEnv.hasUserEnvs(opts);
}

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
  const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
  const userEnvOpt = {
    functionsSource: options.config.path(source),
    projectId: projectId,
    projectAlias: options.projectAlias,
  };
  const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
  const tag = hasUserConfig(runtimeConfig)
    ? hasDotenv(userEnvOpt)
      ? "mixed"
      : "runtime_config"
    : hasDotenv(userEnvOpt)
    ? "dotenv"
    : "none";
  track("functions_codebase_deploy_env_method", tag);

  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
  const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, firebaseEnvs);
  wantBackend.environmentVariables = { ...userEnvs, ...firebaseEnvs };
  payload.functions = { backend: wantBackend };

  // Note: Some of these are premium APIs that require billing to be enabled.
  // We'd eventually have to add special error handling for billing APIs, but
  // enableCloudBuild is called above and has this special casing already.
  if (wantBackend.cloudFunctions.find((f) => f.platform === "gcfv2")) {
    const V2_APIS = {
      artifactregistry: "artifactregistry.googleapis.com",
      cloudrun: "run.googleapis.com",
      eventarc: "eventarc.googleapis.com",
      pubsub: "pubsub.googleapis.com",
    };
    const enablements = Object.entries(V2_APIS).map(([tag, api]) => {
      return ensureApiEnabled.ensure(context.projectId, api, tag);
    });
    await Promise.all(enablements);
  }

  if (wantBackend.cloudFunctions.length) {
    logBullet(
      clc.cyan.bold("functions:") +
        " preparing " +
        clc.bold(options.config.src.functions.source) +
        " directory for uploading..."
    );
  }
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
