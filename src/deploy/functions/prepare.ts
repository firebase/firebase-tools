import * as clc from "colorette";

import * as args from "./args";
import * as backend from "./backend";
import * as build from "./build";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import * as runtimes from "./runtimes";
import * as validate from "./validate";
import * as ensure from "./ensure";
import { Options } from "../../options";
import {
  endpointMatchesAnyFilter,
  getEndpointFilters,
  groupEndpointsByCodebase,
  targetCodebases,
} from "./functionsDeployHelper";
import { logLabeledBullet } from "../../utils";
import { getFunctionsConfig, prepareFunctionsUpload } from "./prepareFunctionsUpload";
import { promptForFailurePolicies, promptForMinInstances } from "./prompts";
import { needProjectId, needProjectNumber } from "../../projectUtils";
import { track } from "../../track";
import { logger } from "../../logger";
import { ensureTriggerRegions } from "./triggerRegionHelper";
import { ensureServiceAgentRoles } from "./checkIam";
import { FirebaseError } from "../../error";
import { configForCodebase, normalizeAndValidate } from "../../functions/projectConfig";
import { AUTH_BLOCKING_EVENTS } from "../../functions/events/v1";
import { generateServiceIdentity } from "../../gcp/serviceusage";
import { previews } from "../../previews";
import { applyBackendHashToBackends } from "./cache/applyHash";

function hasUserConfig(config: Record<string, unknown>): boolean {
  // "firebase" key is always going to exist in runtime config.
  // If any other key exists, we can assume that user is using runtime config.
  return Object.keys(config).length > 1;
}

/**
 * Prepare functions codebases for deploy.
 */
export async function prepare(
  context: args.Context,
  options: Options,
  payload: args.Payload
): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);

  context.config = normalizeAndValidate(options.config.src.functions);
  context.filters = getEndpointFilters(options); // Parse --only filters for functions.

  const codebases = targetCodebases(context.config, context.filters);
  if (codebases.length === 0) {
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
    ensureApiEnabled.ensure(projectId, "artifactregistry.googleapis.com", "artifactregistry"),
  ]);

  // Get the Firebase Config, and set it on each function in the deployment.
  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  context.firebaseConfig = firebaseConfig;
  let runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };
  if (checkAPIsEnabled[1]) {
    // If runtime config API is enabled, load the runtime config.
    runtimeConfig = { ...runtimeConfig, ...(await getFunctionsConfig(projectId)) };
  }

  // ===Phase 1. Load codebase from source.
  context.sources = {};
  const codebaseUsesEnvs: string[] = [];
  const wantBackends: Record<string, backend.Backend> = {};
  for (const codebase of codebases) {
    logLabeledBullet("functions", `preparing codebase ${clc.bold(codebase)} for deployment`);

    const config = configForCodebase(context.config, codebase);
    const sourceDirName = config.source;
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
      runtime: config.runtime || "",
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
    const envs = { ...userEnvs, ...firebaseEnvs };
    const wantBuild: build.Build = await runtimeDelegate.discoverBuild(runtimeConfig, firebaseEnvs);
    const { backend: wantBackend, envs: resolvedEnvs } = await build.resolveBackend(
      wantBuild,
      userEnvOpt,
      userEnvs,
      options.nonInteractive
    );

    let hasEnvsFromParams = false;
    wantBackend.environmentVariables = envs;
    for (const envName of Object.keys(resolvedEnvs)) {
      const envValue = resolvedEnvs[envName]?.toString();
      if (
        envValue &&
        !Object.prototype.hasOwnProperty.call(wantBackend.environmentVariables, envName)
      ) {
        wantBackend.environmentVariables[envName] = envValue;
        hasEnvsFromParams = true;
      }
    }

    for (const endpoint of backend.allEndpoints(wantBackend)) {
      endpoint.environmentVariables = wantBackend.environmentVariables;
      endpoint.codebase = codebase;
    }
    wantBackends[codebase] = wantBackend;
    if (functionsEnv.hasUserEnvs(userEnvOpt) || hasEnvsFromParams) {
      codebaseUsesEnvs.push(codebase);
    }

    if (wantBuild.params.length > 0) {
      if (wantBuild.params.every((p) => p.type !== "secret")) {
        void track("functions_params_in_build", "env_only");
      } else {
        void track("functions_params_in_build", "with_secrets");
      }
    } else {
      void track("functions_params_in_build", "none");
    }
  }

  // ===Phase 1.5. Before proceeding further, let's make sure that we don't have conflicting function names.
  validate.endpointsAreUnique(wantBackends);

  // ===Phase 2. Prepare source for upload.
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    const config = configForCodebase(context.config, codebase);
    const sourceDirName = config.source;
    const sourceDir = options.config.path(sourceDirName);
    const source: args.Source = {};
    if (backend.someEndpoint(wantBackend, () => true)) {
      logLabeledBullet(
        "functions",
        `preparing ${clc.bold(sourceDirName)} directory for uploading...`
      );
    }
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
      const packagedSource = await prepareFunctionsUpload(sourceDir, config);
      source.functionsSourceV2 = packagedSource?.pathToSource;
      source.functionsSourceV2Hash = packagedSource?.hash;
    }
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
      const packagedSource = await prepareFunctionsUpload(sourceDir, config, runtimeConfig);
      source.functionsSourceV1 = packagedSource?.pathToSource;
      source.functionsSourceV1Hash = packagedSource?.hash;
    }
    context.sources[codebase] = source;
  }

  // ===Phase 3. Fill in details and validate endpoints. We run the check for ALL endpoints - we think it's useful for
  // validations to fail even for endpoints that aren't being deployed so any errors are caught early.
  payload.functions = {};
  const haveBackends = groupEndpointsByCodebase(
    wantBackends,
    backend.allEndpoints(await backend.existingBackend(context))
  );
  for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
    const haveBackend = haveBackends[codebase] || backend.empty();
    payload.functions[codebase] = { wantBackend, haveBackend };
  }
  for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
    inferDetailsFromExisting(wantBackend, haveBackend, codebaseUsesEnvs.includes(codebase));
    await ensureTriggerRegions(wantBackend);
    resolveCpu(wantBackend);
    validate.endpointsAreValid(wantBackend);
    inferBlockingDetails(wantBackend);
  }

  const tag = hasUserConfig(runtimeConfig)
    ? codebaseUsesEnvs.length > 0
      ? "mixed"
      : "runtime_config"
    : codebaseUsesEnvs.length > 0
    ? "dotenv"
    : "none";
  void track("functions_codebase_deploy_env_method", tag);

  const codebaseCnt = Object.keys(payload.functions).length;
  void track("functions_codebase_deploy_count", codebaseCnt >= 5 ? "5+" : codebaseCnt.toString());

  // ===Phase 4. Enable APIs required by the deploying backends.
  const wantBackend = backend.merge(...Object.values(wantBackends));
  const haveBackend = backend.merge(...Object.values(haveBackends));

  // Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
  // require cloudscheudler and, in v1, require pub/sub), or can eventually come from
  // explicit dependencies.
  await Promise.all(
    Object.values(wantBackend.requiredAPIs).map(({ api }) => {
      return ensureApiEnabled.ensure(projectId, api, "functions", /* silent=*/ false);
    })
  );
  if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
    // Note: Some of these are premium APIs that require billing to be enabled.
    // We'd eventually have to add special error handling for billing APIs, but
    // enableCloudBuild is called above and has this special casing already.
    const V2_APIS = [
      "run.googleapis.com",
      "eventarc.googleapis.com",
      "pubsub.googleapis.com",
      "storage.googleapis.com",
    ];
    const enablements = V2_APIS.map((api) => {
      return ensureApiEnabled.ensure(context.projectId, api, "functions");
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
  await ensureServiceAgentRoles(projectId, projectNumber, matchingBackend, haveBackend);
  await validate.secretsAreValid(projectId, matchingBackend);
  await ensure.secretAccess(projectId, matchingBackend, haveBackend);

  /**
   * ===Phase 7 Generates the hashes for each of the functions now that secret versions have been resolved.
   * This must be called after `await validate.secretsAreValid`.
   */
  if (previews.skipdeployingnoopfunctions) {
    applyBackendHashToBackends(wantBackends, context);
  }
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

    // N.B. This code doesn't handle automatic downgrading of concurrency if
    // the customer sets CPU <1. We'll instead error that you can't have both.
    // We may want to handle this case, though it might also be surprising to
    // customers if they _don't_ get an error and we silently drop concurrency.
    if (typeof wantE.concurrency === "undefined" && haveE.concurrency) {
      wantE.concurrency = haveE.concurrency;
    }
    if (typeof wantE.cpu === "undefined" && haveE.cpu) {
      wantE.cpu = haveE.cpu;
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

/** Figures out the blocking endpoint options by taking the OR of every trigger option and reassigning that value back to the endpoint. */
export function inferBlockingDetails(want: backend.Backend): void {
  const authBlockingEndpoints = backend
    .allEndpoints(want)
    .filter(
      (ep) =>
        backend.isBlockingTriggered(ep) &&
        AUTH_BLOCKING_EVENTS.includes(ep.blockingTrigger.eventType as any)
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
export function resolveCpu(want: backend.Backend): void {
  for (const e of backend.allEndpoints(want)) {
    if (e.platform === "gcfv1") {
      continue;
    }
    if (e.cpu === "gcf_gen1") {
      e.cpu = backend.memoryToGen1Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
    } else if (!e.cpu) {
      e.cpu = backend.memoryToGen2Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
    }
  }
}
