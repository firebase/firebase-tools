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
import { ensureTriggerRegions } from "./triggerRegionHelper";
import { ensureServiceAgentRoles } from "./checkIam";
import e from "express";

function hasUserConfig(config: Record<string, unknown>): boolean {
  // "firebase" key is always going to exist in runtime config.
  // If any other key exists, we can assume that user is using runtime config.
  return Object.keys(config).length > 1;
}

function hasDotenv(opts: functionsEnv.UserEnvsOpts): boolean {
  return previews.dotenv && functionsEnv.hasUserEnvs(opts);
}

// We previously force-enabled AR. We want to wait on this to see if we can give
// an upgrade warning in the future. If it already is enabled though we want to
// remember this and still use the cleaner if necessary.
async function maybeEnableAR(projectId: string): Promise<boolean> {
  if (previews.artifactregistry) {
    return ensureApiEnabled.check(
      projectId,
      "artifactregistry.googleapis.com",
      "functions",
      /* silent= */ true
    );
  }
  await ensureApiEnabled.ensure(projectId, "artifactregistry.googleapis.com", "functions");
  return true;
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
    maybeEnableAR(projectId),
  ]);
  context.runtimeConfigEnabled = checkAPIsEnabled[1];
  context.artifactRegistryEnabled = checkAPIsEnabled[3];

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
  const usedDotenv = hasDotenv(userEnvOpt);
  const tag = hasUserConfig(runtimeConfig)
    ? usedDotenv
      ? "mixed"
      : "runtime_config"
    : usedDotenv
    ? "dotenv"
    : "none";
  await track("functions_codebase_deploy_env_method", tag);

  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
  const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, firebaseEnvs);
  wantBackend.environmentVariables = { ...userEnvs, ...firebaseEnvs };
  payload.functions = { backend: wantBackend };

  // Note: Some of these are premium APIs that require billing to be enabled.
  // We'd eventually have to add special error handling for billing APIs, but
  // enableCloudBuild is called above and has this special casing already.
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
    const V2_APIS = [
      "artifactregistry.googleapis.com",
      "run.googleapis.com",
      "eventarc.googleapis.com",
      "pubsub.googleapis.com",
      "storage.googleapis.com",
    ];
    const enablements = V2_APIS.map((api) => {
      return ensureApiEnabled.ensure(context.projectId, api, "functions");
    });
    await Promise.all(enablements);
  }

  if (backend.someEndpoint(wantBackend, () => true)) {
    logBullet(
      clc.cyan.bold("functions:") +
        " preparing " +
        clc.bold(options.config.src.functions.source) +
        " directory for uploading..."
    );
  }
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
    context.functionsSourceV1 = await prepareFunctionsUpload(runtimeConfig, options);
  }
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
    context.functionsSourceV2 = await prepareFunctionsUpload(
      /* runtimeConfig= */ undefined,
      options
    );
  }

  // Setup environment variables on each function.
  for (const endpoint of backend.allEndpoints(wantBackend)) {
    endpoint.environmentVariables = wantBackend.environmentVariables;
  }

  // Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
  // require cloudscheudler and, in v1, require pub/sub), or can eventually come from
  // explicit dependencies.
  await Promise.all(
    Object.values(wantBackend.requiredAPIs).map((api) => {
      return ensureApiEnabled.ensure(projectId, api, "functions", /* silent=*/ false);
    })
  );

  // Validate the function code that is being deployed.
  validate.functionIdsAreValid(backend.allEndpoints(wantBackend));

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, context.filters);
  });

  const haveBackend = await backend.existingBackend(context);
  await ensureServiceAgentRoles(projectId, wantBackend, haveBackend);
  inferDetailsFromExisting(wantBackend, haveBackend, usedDotenv);
  await ensureTriggerRegions(wantBackend);

  // Display a warning and prompt if any functions in the release have failurePolicies.
  await promptForFailurePolicies(options, matchingBackend, haveBackend);
  await promptForMinInstances(options, matchingBackend, haveBackend);
  await backend.checkAvailability(context, wantBackend);
}

/**
 * Adds information to the want backend types based on what we can infer from prod.
 * This can help us preserve environment variables set out of band, remember the
 * location of a trigger w/o lookup, etc.
 */
export function inferDetailsFromExisting(
  want: backend.Backend,
  have: backend.Backend,
  usedDotenv: boolean
): void {
  for (const wantE of backend.allEndpoints(want)) {
    const haveE = have.endpoints[wantE.region]?.[wantE.id];
    if (!haveE) {
      continue;
    }

    // By default, preserve existing environment variables.
    // Only overwrite environment variables when the dotenv preview is enabled
    // AND there are user specified environment variables.
    if (!usedDotenv) {
      wantE.environmentVariables = {
        ...haveE.environmentVariables,
        ...wantE.environmentVariables,
      };
    }

    // If the instance size is set out of bounds or was previously set and is now
    // unset we still need to remember it so that the min instance price estimator
    // is accurate.
    if (!wantE.availableMemoryMb && haveE.availableMemoryMb) {
      wantE.availableMemoryMb = haveE.availableMemoryMb;
    }

    maybeCopyTriggerRegion(wantE, haveE);
  }
}

function maybeCopyTriggerRegion(wantE: backend.Endpoint, haveE: backend.Endpoint): void {
  if (!backend.isEventTriggered(wantE) || !backend.isEventTriggered(haveE)) {
    return;
  }
  if (wantE.eventTrigger.region || !haveE.eventTrigger.region) {
    return;
  }

  // Don't copy the region if anything about the trigger resource changed. It's possible
  // they changed the region
  if (
    JSON.stringify(haveE.eventTrigger.eventFilters) !==
    JSON.stringify(wantE.eventTrigger.eventFilters)
  ) {
    return;
  }
  wantE.eventTrigger.region = haveE.eventTrigger.region;
}
