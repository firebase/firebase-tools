import * as clc from "cli-color";

import * as args from "./args";
import * as backend from "./backend";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import * as runtimes from "./runtimes";
import * as validate from "./validate";
import * as ensure from "./ensure";
import { Options } from "../../options";
import { endpointMatchesAnyFilter, getEndpointFilters } from "./functionsDeployHelper";
import { logLabeledBullet, logLabeledError } from "../../utils";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { track } from "../../track";
import { logger } from "../../logger";
import { ensureTriggerRegions } from "./triggerRegionHelper";
import { ensureServiceAgentRoles } from "./checkIam";
import { FirebaseError } from "../../error";
import { normalizeAndValidate, ValidatedSingle } from "../../functions/projectConfig";
import { previews } from "../../previews";
import { want } from "../extensions/planner";

function hasUserConfig(config: Record<string, unknown>): boolean {
  // "firebase" key is always going to exist in runtime config.
  // If any other key exists, we can assume that user is using runtime config.
  return Object.keys(config).length > 1;
}

function hasDotenv(opts: functionsEnv.UserEnvsOpts): boolean {
  return functionsEnv.hasUserEnvs(opts);
}

/**
 *
 */
export async function prepare(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);

  context.config = normalizeAndValidate(options.config.src.functions)[0];
  context.filters = getEndpointFilters(options); // Parse --only filters for functions.

  if (
    context.filters &&
    !context.filters.map((f) => f.codebase).includes(context.config.codebase)
  ) {
    throw new FirebaseError("No function matches given --only filters. Aborting deployment.");
  }

  // Check that all necessary APIs are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensure.maybeEnableAR(projectId),
    ensureApiEnabled.check(
      projectId,
      "runtimeconfig.googleapis.com",
      "runtimeconfig",
      /* silent=*/ true
    ),
    ensureApiEnabled.ensure(projectId, "cloudfunctions.googleapis.com", "functions"),
    ensure.cloudBuildEnabled(projectId),
  ]);

  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };
  if (checkAPIsEnabled[1]) {
    // If runtime config API is enabled, load the runtime config.
    runtimeConfig = { ...runtimeConfig, ...(await getFunctionsConfig(projectId)) };
  }

  logLabeledBullet(
    "functions",
    `preparing codebase ${clc.bold(context.config.codebase)} for deployment`
  );

  const sourceDirName = context.config.source;
  if (!sourceDirName) {
    throw new FirebaseError(
      `No functions code detected at default location (./functions), and no functions source defined in firebase.json`
    );
  }
  const sourceDir = options.config.path(sourceDirName);
  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir,
    projectDir: options.config.projectDir,
    runtime: context.config.runtime || "",
  };
  const userEnvOpt: functionsEnv.UserEnvsOpts = {
    functionsSource: sourceDir,
    projectId: projectId,
    projectAlias: options.projectAlias,
  };

  const wantBackend = await loadSource(
    projectId,
    context.config,
    runtimeConfig,
    delegateContext,
    userEnvOpt
  );

  if (backend.someEndpoint(wantBackend, () => true)) {
    logLabeledBullet(
      "functions",
      `preparing ${clc.bold(sourceDirName)} directory for uploading...`
    );
    prepareUpload(
      sourceDir,
      context.config,
      runtimeConfig,
      backend.someEndpoint(b, (e) => e.platform === "gcfv1"),
      backend.someEndpoint(b, (e) => e.platform === "gcfv2")
    );
  }

  // populate context - collect code here?
  context.firebaseConfig = firebaseConfig;
  context.artifactRegistryEnabled = checkAPIsEnabled[0];

  // const usedDotenv = hasDotenv(userEnvOpt);
  // const tag = hasUserConfig(runtimeConfig)
  //     ? usedDotenv
  //         ? "mixed"
  //         : "runtime_config"
  //     : usedDotenv
  //         ? "dotenv"
  //         : "none";
  // void track("functions_codebase_deploy_env_method", tag);

  // Divide up haveBackends by codebase.

  // const { wantBackend, haveBackend } = Object.values(payload.codebase)[0];
  // const allHaveBackends = await backend.existingBackend(context);
  //
  // const wantEndpointNames = backend.allEndpoints(wantBackend).map((e) => backend.functionName(e));
  // const haveBackend = backend.matchingBackend((endpoint) => {
  //   if (endpoint.codebase === context.config?.codebase) {
  //     return true;
  //   }
  //   return wantEndpointNames.includes(backend.functionName(endpoint));
  // });
  //
  // inferDetailsFromExisting(wantBackend, haveBackend, usedDotenv);
  // validate.endpointsAreValid(wantBackend);
  // // Note: Some of these are premium APIs that require billing to be enabled.
  // // We'd eventually have to add special error handling for billing APIs, but
  // // enableCloudBuild is called above and has this special casing already.
  // if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
  //   const V2_APIS = [
  //     "artifactregistry.googleapis.com",
  //     "run.googleapis.com",
  //     "eventarc.googleapis.com",
  //     "pubsub.googleapis.com",
  //     "storage.googleapis.com",
  //   ];
  //   const enablements = V2_APIS.map((api) => {
  //     return ensureApiEnabled.ensure(context.projectId, api, "functions");
  //   });
  //   await Promise.all(enablements);
  // }
  // // Enable other required APIs. This may come implicitly from triggers (e.g. scheduled triggers
  // // require cloudscheudler and, in v1, require pub/sub), or can eventually come from
  // // explicit dependencies.
  // await Promise.all(
  //   Object.values(wantBackend.requiredAPIs).map(({ api }) => {
  //     return ensureApiEnabled.ensure(projectId, api, "functions", /* silent=*/ false);
  //   })
  // );
  //
  // const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
  //   return endpointMatchesAnyFilter(endpoint, context.filters);
  // });
  // await ensureServiceAgentRoles(projectNumber, wantBackend, haveBackend);
  // await ensureTriggerRegions(wantBackend);
  // // Display a warning and prompt if any functions in the release have failurePolicies.
  // await promptForFailurePolicies(options, matchingBackend, haveBackend);
  // await promptForMinInstances(options, matchingBackend, haveBackend);
  // await backend.checkAvailability(context, wantBackend);
  // await validate.secretsAreValid(projectId, matchingBackend);
  // await ensure.secretAccess(projectId, matchingBackend, haveBackend);
}

async function prepareUpload(
  sourceDir: string,
  config: ValidatedSingle,
  runtimeConfig: Record<string, unknown>,
  hasV1: boolean,
  hasv2: boolean
): Promise<args.Source> {
  const source: args.Source = {};
  if (hasv2) {
    if (!previews.functionsv2) {
      throw new FirebaseError(
        "This version of firebase-tools does not support Google Cloud " +
          "Functions gen 2\n" +
          "If Cloud Functions for Firebase gen 2 is still in alpha, sign up " +
          "for the alpha program at " +
          "https://services.google.com/fb/forms/firebasealphaprogram/\n" +
          "If Cloud Functions for Firebase gen 2 is in beta, get the latest " +
          "version of Firebse Tools with `npm i -g firebase-tools@latest`"
      );
    }
    source.functionsSourceV2 = await prepareFunctionsUpload(sourceDir, config);
  }
  if (hasV1) {
    source.functionsSourceV1 = await prepareFunctionsUpload(sourceDir, config, runtimeConfig);
  }
  return source;
}

async function loadSource(
  projectId: string,
  config: ValidatedSingle,
  runtimeConfig: Record<string, unknown>,
  delegateContext: runtimes.DelegateContext,
  userEnvOpt: functionsEnv.UserEnvsOpts
): Promise<backend.Backend> {
  const firebaseEnvs = functionsEnv.loadFirebaseEnvs(
    runtimeConfig.firebase as Record<string, unknown>,
    projectId
  );
  const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);

  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  logger.debug(`Validating ${runtimeDelegate.name} source`);
  await runtimeDelegate.validate();
  logger.debug(`Building ${runtimeDelegate.name} source`);
  await runtimeDelegate.build();
  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);

  const b = await runtimeDelegate.discoverSpec(runtimeConfig, firebaseEnvs);
  b.environmentVariables = { ...userEnvs, ...firebaseEnvs };
  for (const endpoint of backend.allEndpoints(b)) {
    endpoint.environmentVariables = b.environmentVariables;
    endpoint.codebase = config.codebase;
  }
  return b;
}

/**
 *
 */
export function groupByCodebase(
  wantBackends: Record<string, backend.Backend>,
  haveBackend: backend.Backend
): Record<string, backend.Backend> {
  const grouped: Record<string, backend.Backend> = {};
  // Load all endpoints for the project, then filter out functions from other codebases.
  //
  let currentBackend: backend.Backend = haveBackend;
  for (const codebase of Object.keys(wantBackends)) {
    // An endpoint is part a codebase if:
    //
    //   1. Endpoint is associated w/ the current codebase (duh).
    //   2. Endpoint name matches name of an endpoint we want to deploy
    //
    //   Condition (2) might feel wrong but is a practical conflict resolution strategy. It allows user to "claim" an
    //   endpoint for current codebase without much hassel.
    const names = backend.allEndpoints(wantBackends[codebase]).map((e) => backend.functionName(e));
    grouped[codebase] = backend.matchingBackend(currentBackend, (endpoint) => {
      if (endpoint.codebase === codebase) {
        return true;
      }
      return names.includes(backend.functionName(endpoint));
    });
    currentBackend = backend.matchingBackend(currentBackend, (endpoint) => {
      return !grouped[codebase].endpoints[endpoint.region]?.[endpoint.id];
    });
  }
  return grouped;
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

    wantE.securityLevel = haveE.securityLevel ? haveE.securityLevel : "SECURE_ALWAYS";

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
