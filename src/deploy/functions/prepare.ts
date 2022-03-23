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
import { functionMatchesAnyGroup, getFilterGroups } from "./functionsDeployHelper";
import { logBullet, logLabeledError } from "../../utils";
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

export async function prepare(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);

  context.config = normalizeAndValidate(options.config.src.functions)[0];
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

  // Check that all necessary APIs are enabled.
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
  context.runtimeConfigEnabled = checkAPIsEnabled[1];
  context.artifactRegistryEnabled = checkAPIsEnabled[3];

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;
  const runtimeConfig = await getFunctionsConfig(context);

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
      clc.bold(sourceDirName) +
      " directory for uploading..."
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
    context.functionsSourceV2 = await prepareFunctionsUpload(sourceDir, context.config);
  }
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
    context.functionsSourceV1 = await prepareFunctionsUpload(
      sourceDir,
      context.config,
      runtimeConfig
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
    Object.values(wantBackend.requiredAPIs).map(({ api }) => {
      return ensureApiEnabled.ensure(projectId, api, "functions", /* silent=*/ false);
    })
  );

  // Validate the function code that is being deployed.
  validate.endpointsAreValid(wantBackend);

  // Check what --only filters have been passed in.
  context.filters = getFilterGroups(options);

  const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
    return functionMatchesAnyGroup(endpoint, context.filters);
  });

  const haveBackend = await backend.existingBackend(context);
  await ensureServiceAgentRoles(projectNumber, wantBackend, haveBackend);
  inferDetailsFromExisting(wantBackend, haveBackend, usedDotenv);
  await ensureTriggerRegions(wantBackend);

  // Display a warning and prompt if any functions in the release have failurePolicies.
  await promptForFailurePolicies(options, matchingBackend, haveBackend);
  await promptForMinInstances(options, matchingBackend, haveBackend);
  await backend.checkAvailability(context, wantBackend);
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
