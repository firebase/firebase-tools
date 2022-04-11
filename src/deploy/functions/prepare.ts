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
import { logLabeledBullet } from "../../utils";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { track } from "../../track";
import { logger } from "../../logger";
import { ensureTriggerRegions } from "./triggerRegionHelper";
import { ensureServiceAgentRoles } from "./checkIam";
import { FirebaseError } from "../../error";
import { normalizeAndValidate } from "../../functions/projectConfig";
import { previews } from "../../previews";

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

  // ===Phase 0. Check that minimum APIs required for function deploys are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensureApiEnabled.ensure(projectId, "cloudfunctions.googleapis.com", "functions"),
    ensureApiEnabled.check(
      projectId,
      "runtimeconfig.googleapis.com",
      "runtimeconfig",
      /* silent=*/ true
    ),
    ensure.cloudBuildEnabled(projectId),
    ensure.maybeEnableAR(projectId),
  ]);
  context.artifactRegistryEnabled = checkAPIsEnabled[3];

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;
  let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };
  if (checkAPIsEnabled[1]) {
    // If runtime config API is enabled, load the runtime config.
    runtimeConfig = { ...runtimeConfig, ...(await getFunctionsConfig(projectId)) };
  }

  // ===Phase 1. Load codebase from source.
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
  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  logger.debug(`Validating ${runtimeDelegate.name} source`);
  await runtimeDelegate.validate();
  logger.debug(`Building ${runtimeDelegate.name} source`);
  await runtimeDelegate.build();

  const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
  const userEnvOpt: functionsEnv.UserEnvsOpts = {
    functionsSource: sourceDir,
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
  void track("functions_codebase_deploy_env_method", tag);

  logger.debug(`Analyzing ${runtimeDelegate.name} backend spec`);
  const wantBackend = await runtimeDelegate.discoverSpec(runtimeConfig, firebaseEnvs);
  wantBackend.environmentVariables = { ...userEnvs, ...firebaseEnvs };
  for (const endpoint of backend.allEndpoints(wantBackend)) {
    endpoint.environmentVariables = wantBackend.environmentVariables;
    endpoint.codebase = context.config.codebase;
  }

  // ===Phase 2. Prepare source for upload.
  const source: args.Source = {};
  if (backend.someEndpoint(wantBackend, () => true)) {
    logLabeledBullet(
      "functions",
      `preparing ${clc.bold(sourceDirName)} directory for uploading...`
    );
  }
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
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
    source.functionsSourceV2 = await prepareFunctionsUpload(sourceDir, context.config);
  }
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
    source.functionsSourceV1 = await prepareFunctionsUpload(
      sourceDir,
      context.config,
      runtimeConfig
    );
  }
  context.source = source;

  // ===Phase 3. Fill in details and validate endpoints. We run the check for ALL endpoints - we think it's useful for
  // validations to fail even for endpoints that aren't being deployed so any errors are caught early.

  // Load all existing endpoints for the project, then filter out functions from other codebases.
  //
  // An endpoint is part a codebase if:
  //   1. Endpoint is associated w/ the current codebase (duh).
  //   2. Endpoint name matches name of an endpoint we want to deploy
  //
  //   Condition (2) might feel wrong but is a practical conflict resolution strategy. It allows user to "claim" an
  //   endpoint for current codebase without much hassel.
  const wantEndpointNames = backend.allEndpoints(wantBackend).map((e) => backend.functionName(e));
  const haveBackend = backend.matchingBackend(
    await backend.existingBackend(context),
    (endpoint) => {
      if (endpoint.codebase === context.config?.codebase) {
        return true;
      }
      return wantEndpointNames.includes(backend.functionName(endpoint));
    }
  );
  inferDetailsFromExisting(wantBackend, haveBackend, usedDotenv);
  await ensureTriggerRegions(wantBackend);
  validate.endpointsAreValid(wantBackend);

  payload.functions = { wantBackend: wantBackend, haveBackend: haveBackend };

  // ===Phase 4. Enable APIs required by the deploying backend.

  // Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
  // require cloudscheudler and, in v1, require pub/sub), or can eventually come from
  // explicit dependencies.
  await Promise.all(
    Object.values(wantBackend.requiredAPIs).map(({ api }) => {
      return ensureApiEnabled.ensure(projectId, api, "functions", /* silent=*/ false);
    })
  );
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

  // ===Phase 5. Ask for user prompts for things might warrant user attentions.
  // We limit the scope endpoints being deployed.
  const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
    return endpointMatchesAnyFilter(endpoint, context.filters);
  });
  await promptForFailurePolicies(options, matchingBackend, haveBackend);
  await promptForMinInstances(options, matchingBackend, haveBackend);

  // ===Phase 6. Finalize preparation by "fixing" all extraneous environment issues like IAM policies.
  // We limit the scope endpoints being deployed.
  await backend.checkAvailability(context, matchingBackend);
  await ensureServiceAgentRoles(projectNumber, matchingBackend, haveBackend);
  await validate.secretsAreValid(projectId, matchingBackend);
  await ensure.secretAccess(projectId, matchingBackend, haveBackend);
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
