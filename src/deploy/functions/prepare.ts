import * as clc from "colorette";

import * as args from "./args";
import * as proto from "../../gcp/proto";
import * as backend from "./backend";
import * as build from "./build";
import * as experiments from "../../experiments";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import * as runtimes from "./runtimes";
import * as supported from "./runtimes/supported";
import * as validate from "./validate";
import * as ensure from "./ensure";
import * as events from "../../functions/events/v1";
import { getDatabase } from "./services/firestore";
import { getBucket } from "./services/storage";
import { getDatabaseInstanceDetails } from "./services/database";
import { isGlobalAILogicEndpoint } from "./services/ailogic";
import { parseServiceName, parseConnectorName } from "../../dataconnect/names";
import {
  functionsOrigin,
  artifactRegistryDomain,
  runtimeconfigOrigin,
  cloudRunApiOrigin,
  eventarcOrigin,
  pubsubOrigin,
  storageOrigin,
  secretManagerOrigin,
} from "../../api";
import { Options } from "../../options";
import {
  EndpointFilter,
  endpointMatchesAnyFilter,
  getEndpointFilters,
  groupEndpointsByCodebase,
  targetCodebases,
} from "./functionsDeployHelper";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { isDartEndpoint, classifyNonProductionEndpoints } from "./runtimes/dart/triggerSupport";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { logger } from "../../logger";
import { ensureTriggerRegions } from "./triggerRegionHelper";
import { ensureServiceAgentRoles, ensureGenkitMonitoringRoles } from "./checkIam";
import { FirebaseError, getErrStack } from "../../error";

import {
  configForCodebase,
  normalizeAndValidate,
  ValidatedConfig,
  requireLocal,
  shouldUseRuntimeConfig,
} from "../../functions/projectConfig";
import { AUTH_BLOCKING_EVENTS } from "../../functions/events/v1";
import { generateServiceIdentity } from "../../gcp/serviceusage";
import { applyBackendHashToBackends } from "./cache/applyHash";
import { allEndpoints, Backend } from "./backend";
import { assertExhaustive } from "../../functional";
import { prepareDynamicExtensions } from "../extensions/prepare";
import { Context as ExtContext, Payload as ExtPayload } from "../extensions/args";
import { DeployOptions } from "..";
import * as prompt from "../../prompt";

export const EVENTARC_SOURCE_ENV = "EVENTARC_CLOUD_EVENT_SOURCE";
export const DEFAULT_FUNCTION_REGION = "us-central1";

/**
 * Prepare functions codebases for deploy.
 */
export async function prepare(
  context: args.Context,
  options: DeployOptions,
  payload: args.Payload,
): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);

  context.config = normalizeAndValidate(options.config.src.functions);
  context.filters = getEndpointFilters(options, context.config); // Parse --only filters for functions.

  const codebases = targetCodebases(context.config, context.filters);
  if (codebases.length === 0) {
    throw new FirebaseError("No function matches given --only filters. Aborting deployment.");
  }
  for (const codebase of codebases) {
    logLabeledBullet("functions", `preparing codebase ${clc.bold(codebase)} for deployment`);
  }

  // ===Phase 0. Check that minimum APIs required for function deploys are enabled.
  const checkAPIsEnabled = await Promise.all([
    ensureApiEnabled.ensure(projectId, functionsOrigin(), "functions"),
    ensureApiEnabled.check(projectId, runtimeconfigOrigin(), "runtimeconfig", /* silent=*/ true),
    ensure.cloudBuildEnabled(projectId),
    ensureApiEnabled.ensure(projectId, artifactRegistryDomain(), "artifactregistry"),
  ]);

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;

  context.codebaseDeployEvents = {};

  // ===Phase 1. Load codebases from source with optional runtime config.
  let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };

  const targetedCodebaseConfigs = context.config!.filter((cfg) => codebases.includes(cfg.codebase));

  // Load runtime config if API is enabled and at least one targeted codebase uses it
  if (checkAPIsEnabled[1] && targetedCodebaseConfigs.some(shouldUseRuntimeConfig)) {
    runtimeConfig = { ...runtimeConfig, ...(await getFunctionsConfig(projectId)) };
  }

  // Track whether legacy runtime config is present (i.e., any keys other than the default 'firebase').
  // This drives GA4 metric `has_runtime_config` in the functions deploy reporter.
  context.hasRuntimeConfig = Object.keys(runtimeConfig).some((k) => k !== "firebase");

  const wantBuilds = await loadCodebases(
    context.config,
    options,
    firebaseConfig,
    runtimeConfig,
    context.filters,
  );

  // == Phase 1.5 Prepare extensions found in codebases if any
  if (Object.values(wantBuilds).some((b) => b.extensions && Object.keys(b.extensions).length > 0)) {
    const extContext: ExtContext = {};
    const extPayload: ExtPayload = {};
    await prepareDynamicExtensions(extContext, options, extPayload, wantBuilds);
    context.extensions = extContext;
    payload.extensions = extPayload;
  }

  // == Phase 2. Resolve build to backend.
  const codebaseUsesEnvs: string[] = [];
  const wantBackends: Record<string, backend.Backend> = {};
  for (const [codebase, wantBuild] of Object.entries(wantBuilds)) {
    const config = configForCodebase(context.config, codebase);
    const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
    const localCfg = requireLocal(config, "Remote sources are not supported.");
    const userEnvOpt: functionsEnv.UserEnvsOpts = {
      functionsSource: options.config.path(localCfg.source),
      projectId: projectId,
      projectAlias: options.projectAlias,
    };
    proto.convertIfPresent(userEnvOpt, localCfg, "configDir", (cd) => options.config.path(cd));
    const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
    const envs = { ...userEnvs, ...firebaseEnvs };

    const { backend: wantBackend, envs: resolvedEnvs } = await build.resolveBackend({
      build: wantBuild,
      firebaseConfig,
      userEnvs,
      nonInteractive: options.nonInteractive,
      isEmulator: false,
    });

    functionsEnv.writeResolvedParams(resolvedEnvs, userEnvs, userEnvOpt);

    let hasEnvsFromParams = false;
    wantBackend.environmentVariables = envs;
    for (const envName of Object.keys(resolvedEnvs)) {
      const isList = resolvedEnvs[envName]?.legalList;
      const envValue = resolvedEnvs[envName]?.toSDK();
      if (
        envValue &&
        !resolvedEnvs[envName].internal &&
        (!Object.prototype.hasOwnProperty.call(wantBackend.environmentVariables, envName) || isList)
      ) {
        wantBackend.environmentVariables[envName] = envValue;
        hasEnvsFromParams = true;
      }
    }

    for (const endpoint of backend.allEndpoints(wantBackend)) {
      endpoint.environmentVariables = { ...(wantBackend.environmentVariables || {}) };
      let resource: string;
      if (endpoint.platform === "gcfv1") {
        resource = `projects/${endpoint.project}/locations/${endpoint.region}/functions/${endpoint.id}`;
      } else if (endpoint.platform === "gcfv2" || endpoint.platform === "run") {
        // N.B. If GCF starts allowing v1's allowable characters in IDs they're
        // going to need to have a transform to create a service ID (which has a
        // more restrictive character set). We'll need to reimplement that here.
        // BUG BUG BUG. This has happened and we need to fix it.
        resource = `projects/${endpoint.project}/locations/${endpoint.region}/services/${endpoint.id}`;
      } else {
        assertExhaustive(endpoint.platform);
      }
      endpoint.environmentVariables[EVENTARC_SOURCE_ENV] = resource;
      endpoint.codebase = codebase;
    }
    wantBackends[codebase] = wantBackend;
    if (functionsEnv.hasUserEnvs(userEnvOpt) || hasEnvsFromParams) {
      codebaseUsesEnvs.push(codebase);
    }

    context.codebaseDeployEvents[codebase] = {
      fn_deploy_num_successes: 0,
      fn_deploy_num_failures: 0,
      fn_deploy_num_canceled: 0,
      fn_deploy_num_skipped: 0,
    };

    if (wantBuild.params.length > 0) {
      if (wantBuild.params.every((p) => p.type !== "secret")) {
        context.codebaseDeployEvents[codebase].params = "env_only";
      } else {
        context.codebaseDeployEvents[codebase].params = "with_secrets";
      }
    } else {
      context.codebaseDeployEvents[codebase].params = "none";
    }
    context.codebaseDeployEvents[codebase].runtime = wantBuild.runtime;
  }

  // ===Phase 2.5. Before proceeding further, let's make sure that we don't have conflicting function names.
  validate.endpointsAreUnique(wantBackends);

  // ===Phase 3. Prepare source for upload.
  context.sources = {};
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    const cfg = configForCodebase(context.config, codebase);
    const localCfg = requireLocal(cfg, "Remote sources are not supported.");
    const sourceDirName = localCfg.source;
    const sourceDir = options.config.path(sourceDirName);
    const source: args.Source = {};
    if (backend.someEndpoint(wantBackend, () => true)) {
      logLabeledBullet(
        "functions",
        `preparing ${clc.bold(sourceDirName)} directory for uploading...`,
      );
    }

    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2" || e.platform === "run")) {
      const schPathSet = new Set<string>();
      for (const e of backend.allEndpoints(wantBackend)) {
        if (
          backend.isDataConnectGraphqlTriggered(e) &&
          e.dataConnectGraphqlTrigger.schemaFilePath
        ) {
          schPathSet.add(e.dataConnectGraphqlTrigger.schemaFilePath);
        }
      }
      const exportType = backend.someEndpoint(wantBackend, (e) => e.platform === "run")
        ? "tar.gz"
        : "zip";

      const isDart = supported.runtimeIsLanguage(wantBuilds[codebase].runtime!, "dart");
      const executablePaths = isDart ? ["bin/server"] : [];

      const packagedSource = await prepareFunctionsUpload(
        options.config.projectDir,
        sourceDir,
        localCfg,
        [...schPathSet],
        undefined,
        { exportType, executablePaths },
      );
      source.functionsSourceV2 = packagedSource?.pathToSource;
      source.functionsSourceV2Hash = packagedSource?.hash;
    }
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
      const configForUpload = shouldUseRuntimeConfig(localCfg) ? runtimeConfig : undefined;
      const packagedSource = await prepareFunctionsUpload(
        options.config.projectDir,
        sourceDir,
        localCfg,
        [],
        configForUpload,
      );
      source.functionsSourceV1 = packagedSource?.pathToSource;
      source.functionsSourceV1Hash = packagedSource?.hash;
    }
    context.sources[codebase] = source;
  }

  // ===Phase 4. Fill in details and validate endpoints. We run the check for ALL endpoints - we think it's useful for
  // validations to fail even for endpoints that aren't being deployed so any errors are caught early.
  payload.functions = {};
  // Resolve default regions for backends we want before grouping endpoints by codebase.
  // This way, endpoints aren't incorrectly grouped together under the REGION_TBD region if the
  // region is unresolved for multiple codebases.
  const existingBackend = await backend.existingBackend(context);
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    const relevantEndpoints = backend
      .allEndpoints(existingBackend)
      .filter((e) => e.codebase === codebase || e.codebase === undefined);
    await resolveDefaultRegions(wantBackend, backend.of(...relevantEndpoints));
  }
  const haveBackends = groupEndpointsByCodebase(
    wantBackends,
    backend.allEndpoints(existingBackend),
  );
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    const haveBackend = haveBackends[codebase] || backend.empty();
    payload.functions[codebase] = { wantBackend, haveBackend };
  }
  for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
    inferDetailsFromExisting(wantBackend, haveBackend, codebaseUsesEnvs.includes(codebase));
    await ensureTriggerRegions(wantBackend);
    resolveCpuAndConcurrency(wantBackend);
    validate.endpointsAreValid(wantBackend);
    inferBlockingDetails(wantBackend);
  }

  // ===Phase 5. Enable APIs required by the deploying backends.
  const wantBackend = backend.merge(...Object.values(wantBackends));
  const haveBackend = backend.merge(...Object.values(haveBackends));

  await ensureAllRequiredAPIsEnabled(projectNumber, wantBackend);
  await warnIfNewGenkitFunctionIsMissingSecrets(wantBackend, haveBackend, options);
  warnIfDartBackendHasUnsupportedTriggers(wantBackend);

  // ===Phase 6. Ask for user prompts for things might warrant user attentions.
  // We limit the scope endpoints being deployed.
  const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
    return endpointMatchesAnyFilter(endpoint, context.filters);
  });
  await promptForFailurePolicies(options, matchingBackend, haveBackend);
  await promptForMinInstances(options, matchingBackend, haveBackend);

  // ===Phase 7. Finalize preparation by "fixing" all extraneous environment issues like IAM policies.
  // We limit the scope endpoints being deployed.
  await backend.checkAvailability(context, matchingBackend);
  await validate.secretsAreValid(projectId, matchingBackend);
  await ensureServiceAgentRoles(
    projectId,
    projectNumber,
    matchingBackend,
    haveBackend,
    options.dryRun,
  );
  await ensureGenkitMonitoringRoles(
    projectId,
    projectNumber,
    matchingBackend,
    haveBackend,
    options.dryRun,
  );
  await ensure.secretAccess(projectId, matchingBackend, haveBackend, options.dryRun);
  /**
   * ===Phase 8 Generates the hashes for each of the functions now that secret versions have been resolved.
   * This must be called after `await validate.secretsAreValid`.
   */
  updateEndpointTargetedStatus(wantBackends, context.filters || []);
  validate.checkFiltersIntegrity(wantBackends, context.filters);
  applyBackendHashToBackends(wantBackends, context);
}

function moveEndpointToRegion(
  backend: backend.Backend,
  endpoint: backend.Endpoint,
  region: string,
) {
  endpoint.region = region;
  backend.endpoints[region] = backend.endpoints[region] || {};
  backend.endpoints[region][endpoint.id] = endpoint;
  delete backend.endpoints[build.REGION_TBD][endpoint.id];
  if (Object.keys(backend.endpoints[build.REGION_TBD]).length === 0) {
    delete backend.endpoints[build.REGION_TBD];
  }
}

/**
 * Verifies that we don't have a peculiar edge case where we cannot know what region a default endpoint was in.
 * This is only possible in insane edge cases (esp since you can only have multi-region functions for HTTPS and
 * regional AI Logic functions) where a customer HAD specified multiple regions in a function and then deleted
 * the regions annotation entirely and we don't know which to delete and which to keep.
 */
export function matchRegionsForExisting(want: backend.Backend, have: backend.Backend): void {
  for (const [id, wantE] of Object.entries(want.endpoints[build.REGION_TBD] || {})) {
    let matching: backend.Endpoint | undefined;
    for (const region of Object.keys(have.endpoints)) {
      if (region === build.REGION_TBD) {
        continue;
      }
      if (have.endpoints[region][id]) {
        if (matching) {
          throw new FirebaseError(
            `Cannot resolve default region for function ${id}. It exists in multiple regions. The region must be specified to continue.`,
          );
        }
        matching = have.endpoints[region][id];
      }
    }

    if (!matching) {
      continue;
    }

    moveEndpointToRegion(want, wantE, matching.region);
  }
}

/**
 * Resolves regions for endpoints that were not specified in the build.
 * This is an improvement from old logic where everything was hard-coded to us-central1. Now,
 * we can move defaults to adjust for regional capacity or automaically match the function
 * to its event source allowing region to be specified less often.
 */
// N.B. This is async because it will eventually look up backend info
export async function resolveDefaultRegions(
  want: backend.Backend,
  have: backend.Backend,
): Promise<void> {
  matchRegionsForExisting(want, have);

  const endpoints = Object.values(want.endpoints[build.REGION_TBD] || {});

  for (const endpoint of endpoints) {
    let resolvedRegion = "us-central1";

    try {
      if (backend.isBlockingTriggered(endpoint)) {
        resolvedRegion = resolveRegionForBlockingTrigger(endpoint);
      } else if (backend.isEventTriggered(endpoint)) {
        resolvedRegion = await resolveRegionForEventTrigger(endpoint);
      }
    } catch (err: any) {
      logger.debug(
        `Failed to resolve region for endpoint ${endpoint.id}. Defaulting to us-central1.`,
        getErrStack(err),
      );
    }

    moveEndpointToRegion(want, endpoint, resolvedRegion);
  }
}

function resolveRegionForBlockingTrigger(
  endpoint: backend.Endpoint & backend.BlockingTriggered,
): string {
  const eventType = endpoint.blockingTrigger.eventType;
  if ((events.AUTH_BLOCKING_EVENTS as readonly string[]).includes(eventType)) {
    return "us-east1";
  }

  if (isGlobalAILogicEndpoint(endpoint)) {
    return "us-east1";
  }

  return DEFAULT_FUNCTION_REGION;
}

async function resolveRegionForEventTrigger(
  endpoint: backend.Endpoint & backend.EventTriggered,
): Promise<string> {
  const eventTrigger = endpoint.eventTrigger;
  const eventType = eventTrigger.eventType;

  // Global functions should be deployed to us-east1.
  if (
    eventType.startsWith("google.cloud.pubsub.") ||
    eventType.startsWith("providers/cloud.auth/eventTypes/") ||
    eventType.startsWith("providers/firebase.auth/eventTypes/") ||
    eventType.startsWith("google.firebase.testlab.") ||
    eventType.startsWith("google.firebase.remoteconfig.") ||
    eventType.startsWith("google.firebase.firebasealerts.")
  ) {
    return "us-east1";
  }

  // Firestore functions should be deployed to the same region as the database.
  // In multi-region locations, we default to:
  // * nam5 -> us-central1
  // * nam7 -> us-central1
  // * eur3 -> europe-west1
  if (eventType.startsWith("google.cloud.firestore.")) {
    try {
      const databaseId = eventTrigger.eventFilters?.database || "(default)";
      const db = await getDatabase(endpoint.project, databaseId);
      const locationId = db.locationId.toLowerCase();

      if (locationId === "nam5" || locationId === "nam7") return "us-central1";
      if (locationId === "eur3") return "europe-west1";
      return locationId;
    } catch (err: any) {
      logger.debug("Failed to resolve Firestore database location", getErrStack(err));
    }
  }

  // Cloud Storage functions should be deployed to the same region as the bucket.
  // In multi-region locations, we default to:
  // * us -> us-east1
  // * eu -> europe-west1
  // * asia -> asia-east1
  if (eventType.startsWith("google.cloud.storage.")) {
    try {
      const bucketName = eventTrigger.eventFilters?.bucket;
      if (bucketName) {
        const bucket = await getBucket(bucketName);
        const locationId = bucket.location.toLowerCase();

        if (locationId === "us") return "us-east1";
        if (locationId === "eu") return "europe-west1";
        if (locationId === "asia") return "asia-east1";
        return locationId;
      }
    } catch (err: any) {
      logger.debug("Failed to resolve Cloud Storage bucket location", getErrStack(err));
    }
  }

  // Realtime Database functions should be deployed to the same region as the database.
  if (eventType.startsWith("google.firebase.database.")) {
    if (eventTrigger.region) return eventTrigger.region;

    try {
      const instanceName = eventTrigger.eventFilters?.instance;
      if (instanceName) {
        const details = await getDatabaseInstanceDetails(endpoint.project, instanceName);
        if (details.location && details.location !== "-") {
          return details.location.toLowerCase();
        }
      }
    } catch (err: any) {
      logger.debug("Failed to resolve Realtime Database instance location", getErrStack(err));
    }
  }

  // DataConnect functions should be deployed to the same region as the service.
  if (eventType.startsWith("google.firebase.dataconnect.")) {
    if (eventTrigger.region) return eventTrigger.region;

    try {
      const service = eventTrigger.eventFilters?.service;
      if (service) {
        return parseServiceName(service).location;
      }

      const connector = eventTrigger.eventFilters?.connector;
      if (connector) {
        return parseConnectorName(connector).location;
      }
    } catch (err: any) {
      logger.debug("Failed to resolve DataConnect location", getErrStack(err));
    }
  }

  return DEFAULT_FUNCTION_REGION;
}

/**
 * Adds information to the want backend types based on what we can infer from prod.
 * This can help us preserve environment variables set out of band, remember the
 * location of a trigger w/o lookup, etc.
 */
export function inferDetailsFromExisting(
  want: backend.Backend,
  have: backend.Backend,
  usedDotenv: boolean,
): void {
  for (const wantE of backend.allEndpoints(want)) {
    const haveE = have.endpoints[wantE.region]?.[wantE.id];
    if (!haveE) {
      continue;
    }

    // Copy the service id over to the new endpoint.
    wantE.runServiceId = haveE.runServiceId;

    // By default, preserve existing environment variables.
    // Only overwrite environment variables when there are user specified environment variables.
    if (!usedDotenv) {
      wantE.environmentVariables = {
        ...haveE.environmentVariables,
        ...wantE.environmentVariables,
      };
    }

    // If the instance size is set out of bounds or was previously set and is now
    // unset we still need to remember it so that the min instance price estimator
    // is accurate. If, on the other hand, we have a null value for availableMemoryMb
    // we need to keep that null (meaning "use defaults").
    if (typeof wantE.availableMemoryMb === "undefined" && haveE.availableMemoryMb) {
      wantE.availableMemoryMb = haveE.availableMemoryMb;
    }

    if (typeof wantE.cpu === "undefined" && haveE.cpu) {
      wantE.cpu = haveE.cpu;
    }

    // N.B. concurrency has different defaults based on CPU. If the customer
    // only specifies CPU and they change that specification to < 1, we should
    // turn off concurrency.
    // We'll handle this in setCpuAndConcurrency

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

/**
 * Determines whether endpoints are targeted by an --only flag.
 */
export function updateEndpointTargetedStatus(
  wantBackends: Record<string, Backend>,
  endpointFilters: EndpointFilter[],
): void {
  for (const wantBackend of Object.values(wantBackends)) {
    for (const endpoint of allEndpoints(wantBackend)) {
      endpoint.targetedByOnly = endpointMatchesAnyFilter(endpoint, endpointFilters);
    }
  }
}

/** Figures out the blocking endpoint options by taking the OR of every trigger option and reassigning that value back to the endpoint. */
export function inferBlockingDetails(want: backend.Backend): void {
  const authBlockingEndpoints = backend
    .allEndpoints(want)
    .filter(
      (ep) =>
        backend.isBlockingTriggered(ep) &&
        AUTH_BLOCKING_EVENTS.includes(ep.blockingTrigger.eventType as any),
    ) as (backend.Endpoint & backend.BlockingTriggered)[];

  if (authBlockingEndpoints.length === 0) {
    return;
  }

  let accessToken = false;
  let idToken = false;
  let refreshToken = false;
  for (const blockingEp of authBlockingEndpoints) {
    accessToken ||= !!blockingEp.blockingTrigger.options?.accessToken;
    idToken ||= !!blockingEp.blockingTrigger.options?.idToken;
    refreshToken ||= !!blockingEp.blockingTrigger.options?.refreshToken;
  }
  for (const blockingEp of authBlockingEndpoints) {
    if (!blockingEp.blockingTrigger.options) {
      blockingEp.blockingTrigger.options = {};
    }
    blockingEp.blockingTrigger.options.accessToken = accessToken;
    blockingEp.blockingTrigger.options.idToken = idToken;
    blockingEp.blockingTrigger.options.refreshToken = refreshToken;
  }
}

/**
 * Assigns the CPU level to a function based on its memory if CPU is not
 * provided and sets concurrency based on the CPU level if not provided.
 * After this function, CPU will be a real number and not "gcf_gen1".
 */
export function resolveCpuAndConcurrency(want: backend.Backend): void {
  for (const e of backend.allEndpoints(want)) {
    if (e.platform === "gcfv1") {
      continue;
    }
    if (e.cpu === "gcf_gen1") {
      e.cpu = backend.memoryToGen1Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
    } else if (!e.cpu) {
      e.cpu = backend.memoryToGen2Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
    }

    if (!e.concurrency) {
      e.concurrency = e.cpu >= 1 ? backend.DEFAULT_CONCURRENCY : 1;
    }
  }
}

/**
 * Exported for use by an internal command (internaltesting:functions:discover) only.
 * @internal
 */
export async function loadCodebases(
  config: ValidatedConfig,
  options: Options,
  firebaseConfig: args.FirebaseConfig,
  runtimeConfig: Record<string, unknown>,
  filters?: EndpointFilter[],
): Promise<Record<string, build.Build>> {
  const codebases = targetCodebases(config, filters);
  const projectId = needProjectId(options);

  const wantBuilds: Record<string, build.Build> = {};
  for (const codebase of codebases) {
    const codebaseConfig = configForCodebase(config, codebase);
    const sourceDirName = codebaseConfig.source;
    if (!sourceDirName) {
      throw new FirebaseError(
        `No functions code detected at default location (./functions), and no functions source defined in firebase.json`,
      );
    }
    const sourceDir = options.config.path(sourceDirName);
    const delegateContext: runtimes.DelegateContext = {
      projectId,
      sourceDir,
      projectDir: options.config.projectDir,
      runtime: codebaseConfig.runtime,
    };
    const firebaseJsonRuntime = codebaseConfig.runtime;
    if (firebaseJsonRuntime && !supported.isRuntime(firebaseJsonRuntime as string)) {
      throw new FirebaseError(
        `Functions codebase ${codebase} has invalid runtime ` +
          `${firebaseJsonRuntime} specified in firebase.json. Valid values are: \n` +
          (Object.keys(supported.RUNTIMES) as supported.Runtime[])
            .filter((runtime) => !supported.isDecommissioned(runtime))
            .map((s) => `- ${s}`)
            .join("\n"),
      );
    }
    const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
    logger.debug(`Validating ${runtimeDelegate.language} source`);
    if (!experiments.isEnabled("bypassfunctionsdeprecationcheck")) {
      supported.guardVersionSupport(runtimeDelegate.runtime);
    }
    await runtimeDelegate.validate();
    logger.debug(`Building ${runtimeDelegate.language} source`);
    await runtimeDelegate.build();

    const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
    logLabeledBullet(
      "functions",
      `Loading and analyzing source code for codebase ${codebase} to determine what to deploy`,
    );

    const codebaseRuntimeConfig = shouldUseRuntimeConfig(codebaseConfig)
      ? runtimeConfig
      : { firebase: firebaseConfig };

    const discoveredBuild = await runtimeDelegate.discoverBuild(codebaseRuntimeConfig, {
      ...firebaseEnvs,
      // Quota project is required when using GCP's Client-based APIs
      // Some GCP client SDKs, like Vertex AI, requires appropriate quota project setup
      // in order for .init() calls to succeed.
      GOOGLE_CLOUD_QUOTA_PROJECT: projectId,
    });
    discoveredBuild.runtime = codebaseConfig.runtime;
    build.applyPrefix(discoveredBuild, codebaseConfig.prefix || "");
    wantBuilds[codebase] = discoveredBuild;
  }
  return wantBuilds;
}

/**
 * Warns when a Dart backend contains triggers that are not yet
 * production-ready. Classification is owned by the shared
 * `dart/triggerSupport` module.
 */
function warnIfDartBackendHasUnsupportedTriggers(want: backend.Backend): void {
  const dartEndpoints = backend.allEndpoints(want).filter(isDartEndpoint);
  if (dartEndpoints.length === 0) {
    return;
  }

  const { emulatorOnly, experimental } = classifyNonProductionEndpoints(dartEndpoints);
  const unsupported = [...emulatorOnly, ...experimental];
  if (unsupported.length > 0) {
    logLabeledWarning(
      "functions",
      `The following Dart functions use triggers that are not yet supported for production deployment: ${unsupported.map((ep) => ep.id).join(", ")}. ` +
        "They will be deployed but may not work as expected. " +
        "See https://github.com/firebase/firebase-functions-dart for current trigger support.",
    );
  }
}

// Genkit almost always requires an API key, so warn if the customer is about to deploy
// a function and doesn't have one. To avoid repetitive nagging, only warn on the first
// deploy of the function.
export async function warnIfNewGenkitFunctionIsMissingSecrets(
  have: backend.Backend,
  want: backend.Backend,
  options: DeployOptions,
) {
  if (options.force) {
    return;
  }

  const newAndMissingSecrets = backend.allEndpoints(
    backend.matchingBackend(want, (e) => {
      if (!backend.isCallableTriggered(e) || !e.callableTrigger.genkitAction) {
        return false;
      }
      if (e.secretEnvironmentVariables?.length) {
        return false;
      }
      return !backend.hasEndpoint(have)(e);
    }),
  );

  if (newAndMissingSecrets.length) {
    const message =
      `The function(s) ${newAndMissingSecrets.map((e) => e.id).join(", ")} use Genkit but do not have access to a secret. ` +
      "This may cause the function to fail if it depends on an API key. To learn more about granting a function access to " +
      "secrets, see https://firebase.google.com/docs/functions/config-env?gen=2nd#secret_parameters. Continue?";
    if (!(await prompt.confirm({ message, nonInteractive: options.nonInteractive }))) {
      throw new FirebaseError("Aborted");
    }
  }
}

// Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
// require cloudscheduler and, in v1, require pub/sub), use of features (secrets), or explicit dependencies.
export async function ensureAllRequiredAPIsEnabled(
  projectNumber: string,
  wantBackend: backend.Backend,
): Promise<void> {
  await Promise.all(
    Object.values(wantBackend.requiredAPIs).map(({ api }) => {
      return ensureApiEnabled.ensure(projectNumber, api, "functions", /* silent=*/ false);
    }),
  );
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
    // Note: Some of these are premium APIs that require billing to be enabled.
    // We'd eventually have to add special error handling for billing APIs, but
    // enableCloudBuild is called above and has this special casing already.
    const V2_APIS = [cloudRunApiOrigin(), eventarcOrigin(), pubsubOrigin(), storageOrigin()];
    const enablements = V2_APIS.map((api) => {
      return ensureApiEnabled.ensure(projectNumber, api, "functions");
    });
    await Promise.all(enablements);
    // Need to manually kick off the p4sa activation of services
    // that we use with IAM roles assignment.
    const services = ["pubsub.googleapis.com", "eventarc.googleapis.com"];
    const generateServiceAccounts = services.map((service) => {
      return generateServiceIdentity(projectNumber, service, "functions");
    });
    await Promise.all(generateServiceAccounts);
  }

  // If function is making use of secrets, go ahead and enable Secret Manager API.
  if (
    backend.someEndpoint(
      wantBackend,
      (e) => !!(e.secretEnvironmentVariables && e.secretEnvironmentVariables.length > 0),
    )
  ) {
    await ensureApiEnabled.ensure(
      projectNumber,
      secretManagerOrigin(),
      "functions",
      /* silent=*/ false,
    );
  }
}
