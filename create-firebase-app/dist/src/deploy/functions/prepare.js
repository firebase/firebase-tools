"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAllRequiredAPIsEnabled = exports.warnIfNewGenkitFunctionIsMissingSecrets = exports.loadCodebases = exports.resolveCpuAndConcurrency = exports.inferBlockingDetails = exports.updateEndpointTargetedStatus = exports.inferDetailsFromExisting = exports.prepare = exports.EVENTARC_SOURCE_ENV = void 0;
const clc = require("colorette");
const proto = require("../../gcp/proto");
const backend = require("./backend");
const build = require("./build");
const ensureApiEnabled = require("../../ensureApiEnabled");
const functionsConfig = require("../../functionsConfig");
const functionsEnv = require("../../functions/env");
const runtimes = require("./runtimes");
const supported = require("./runtimes/supported");
const validate = require("./validate");
const ensure = require("./ensure");
const experiments = require("../../experiments");
const api_1 = require("../../api");
const functionsDeployHelper_1 = require("./functionsDeployHelper");
const utils_1 = require("../../utils");
const prepareFunctionsUpload_1 = require("./prepareFunctionsUpload");
const prompts_1 = require("./prompts");
const projectUtils_1 = require("../../projectUtils");
const logger_1 = require("../../logger");
const triggerRegionHelper_1 = require("./triggerRegionHelper");
const checkIam_1 = require("./checkIam");
const error_1 = require("../../error");
const projectConfig_1 = require("../../functions/projectConfig");
const v1_1 = require("../../functions/events/v1");
const serviceusage_1 = require("../../gcp/serviceusage");
const applyHash_1 = require("./cache/applyHash");
const backend_1 = require("./backend");
const functional_1 = require("../../functional");
const prepare_1 = require("../extensions/prepare");
const prompt = require("../../prompt");
exports.EVENTARC_SOURCE_ENV = "EVENTARC_CLOUD_EVENT_SOURCE";
/**
 * Prepare functions codebases for deploy.
 */
async function prepare(context, options, payload) {
    var _a, _b;
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const projectNumber = await (0, projectUtils_1.needProjectNumber)(options);
    context.config = (0, projectConfig_1.normalizeAndValidate)(options.config.src.functions);
    context.filters = (0, functionsDeployHelper_1.getEndpointFilters)(options); // Parse --only filters for functions.
    const codebases = (0, functionsDeployHelper_1.targetCodebases)(context.config, context.filters);
    if (codebases.length === 0) {
        throw new error_1.FirebaseError("No function matches given --only filters. Aborting deployment.");
    }
    for (const codebase of codebases) {
        (0, utils_1.logLabeledBullet)("functions", `preparing codebase ${clc.bold(codebase)} for deployment`);
    }
    // ===Phase 0. Check that minimum APIs required for function deploys are enabled.
    const checkAPIsEnabled = await Promise.all([
        ensureApiEnabled.ensure(projectId, (0, api_1.functionsOrigin)(), "functions"),
        ensureApiEnabled.check(projectId, (0, api_1.runtimeconfigOrigin)(), "runtimeconfig", /* silent=*/ true),
        ensure.cloudBuildEnabled(projectId),
        ensureApiEnabled.ensure(projectId, (0, api_1.artifactRegistryDomain)(), "artifactregistry"),
    ]);
    // Get the Firebase Config, and set it on each function in the deployment.
    const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
    context.firebaseConfig = firebaseConfig;
    context.codebaseDeployEvents = {};
    // ===Phase 1. Load codebases from source with optional runtime config.
    let runtimeConfig = { firebase: firebaseConfig };
    const allowFunctionsConfig = experiments.isEnabled("dangerouslyAllowFunctionsConfig");
    // Load runtime config if experiment allows it and API is enabled
    if (allowFunctionsConfig && checkAPIsEnabled[1]) {
        runtimeConfig = Object.assign(Object.assign({}, runtimeConfig), (await (0, prepareFunctionsUpload_1.getFunctionsConfig)(projectId)));
    }
    // Track whether legacy runtime config is present (i.e., any keys other than the default 'firebase').
    // This drives GA4 metric `has_runtime_config` in the functions deploy reporter.
    context.hasRuntimeConfig = Object.keys(runtimeConfig).some((k) => k !== "firebase");
    const wantBuilds = await loadCodebases(context.config, options, firebaseConfig, runtimeConfig, context.filters);
    // == Phase 1.5 Prepare extensions found in codebases if any
    if (Object.values(wantBuilds).some((b) => b.extensions)) {
        const extContext = {};
        const extPayload = {};
        await (0, prepare_1.prepareDynamicExtensions)(extContext, options, extPayload, wantBuilds);
        context.extensions = extContext;
        payload.extensions = extPayload;
    }
    // == Phase 2. Resolve build to backend.
    const codebaseUsesEnvs = [];
    const wantBackends = {};
    for (const [codebase, wantBuild] of Object.entries(wantBuilds)) {
        const config = (0, projectConfig_1.configForCodebase)(context.config, codebase);
        const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
        const localCfg = (0, projectConfig_1.requireLocal)(config, "Remote sources are not supported.");
        const userEnvOpt = {
            functionsSource: options.config.path(localCfg.source),
            projectId: projectId,
            projectAlias: options.projectAlias,
        };
        proto.convertIfPresent(userEnvOpt, localCfg, "configDir", (cd) => options.config.path(cd));
        const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
        const envs = Object.assign(Object.assign({}, userEnvs), firebaseEnvs);
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
            const isList = (_a = resolvedEnvs[envName]) === null || _a === void 0 ? void 0 : _a.legalList;
            const envValue = (_b = resolvedEnvs[envName]) === null || _b === void 0 ? void 0 : _b.toSDK();
            if (envValue &&
                !resolvedEnvs[envName].internal &&
                (!Object.prototype.hasOwnProperty.call(wantBackend.environmentVariables, envName) || isList)) {
                wantBackend.environmentVariables[envName] = envValue;
                hasEnvsFromParams = true;
            }
        }
        for (const endpoint of backend.allEndpoints(wantBackend)) {
            endpoint.environmentVariables = Object.assign({}, (wantBackend.environmentVariables || {}));
            let resource;
            if (endpoint.platform === "gcfv1") {
                resource = `projects/${endpoint.project}/locations/${endpoint.region}/functions/${endpoint.id}`;
            }
            else if (endpoint.platform === "gcfv2" || endpoint.platform === "run") {
                // N.B. If GCF starts allowing v1's allowable characters in IDs they're
                // going to need to have a transform to create a service ID (which has a
                // more restrictive character set). We'll need to reimplement that here.
                // BUG BUG BUG. This has happened and we need to fix it.
                resource = `projects/${endpoint.project}/locations/${endpoint.region}/services/${endpoint.id}`;
            }
            else {
                (0, functional_1.assertExhaustive)(endpoint.platform);
            }
            endpoint.environmentVariables[exports.EVENTARC_SOURCE_ENV] = resource;
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
            }
            else {
                context.codebaseDeployEvents[codebase].params = "with_secrets";
            }
        }
        else {
            context.codebaseDeployEvents[codebase].params = "none";
        }
        context.codebaseDeployEvents[codebase].runtime = wantBuild.runtime;
    }
    // ===Phase 2.5. Before proceeding further, let's make sure that we don't have conflicting function names.
    validate.endpointsAreUnique(wantBackends);
    // ===Phase 3. Prepare source for upload.
    context.sources = {};
    for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
        const cfg = (0, projectConfig_1.configForCodebase)(context.config, codebase);
        const localCfg = (0, projectConfig_1.requireLocal)(cfg, "Remote sources are not supported.");
        const sourceDirName = localCfg.source;
        const sourceDir = options.config.path(sourceDirName);
        const source = {};
        if (backend.someEndpoint(wantBackend, () => true)) {
            (0, utils_1.logLabeledBullet)("functions", `preparing ${clc.bold(sourceDirName)} directory for uploading...`);
        }
        if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
            const packagedSource = await (0, prepareFunctionsUpload_1.prepareFunctionsUpload)(sourceDir, localCfg);
            source.functionsSourceV2 = packagedSource === null || packagedSource === void 0 ? void 0 : packagedSource.pathToSource;
            source.functionsSourceV2Hash = packagedSource === null || packagedSource === void 0 ? void 0 : packagedSource.hash;
        }
        if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv1")) {
            const packagedSource = await (0, prepareFunctionsUpload_1.prepareFunctionsUpload)(sourceDir, localCfg, runtimeConfig);
            source.functionsSourceV1 = packagedSource === null || packagedSource === void 0 ? void 0 : packagedSource.pathToSource;
            source.functionsSourceV1Hash = packagedSource === null || packagedSource === void 0 ? void 0 : packagedSource.hash;
        }
        context.sources[codebase] = source;
    }
    // ===Phase 4. Fill in details and validate endpoints. We run the check for ALL endpoints - we think it's useful for
    // validations to fail even for endpoints that aren't being deployed so any errors are caught early.
    payload.functions = {};
    const haveBackends = (0, functionsDeployHelper_1.groupEndpointsByCodebase)(wantBackends, backend.allEndpoints(await backend.existingBackend(context)));
    for (const [codebase, wantBackend] of Object.entries(wantBackends)) {
        const haveBackend = haveBackends[codebase] || backend.empty();
        payload.functions[codebase] = { wantBackend, haveBackend };
    }
    for (const [codebase, { wantBackend, haveBackend }] of Object.entries(payload.functions)) {
        inferDetailsFromExisting(wantBackend, haveBackend, codebaseUsesEnvs.includes(codebase));
        await (0, triggerRegionHelper_1.ensureTriggerRegions)(wantBackend);
        resolveCpuAndConcurrency(wantBackend);
        validate.endpointsAreValid(wantBackend);
        inferBlockingDetails(wantBackend);
    }
    // ===Phase 5. Enable APIs required by the deploying backends.
    const wantBackend = backend.merge(...Object.values(wantBackends));
    const haveBackend = backend.merge(...Object.values(haveBackends));
    await ensureAllRequiredAPIsEnabled(projectNumber, wantBackend);
    await warnIfNewGenkitFunctionIsMissingSecrets(wantBackend, haveBackend, options);
    // ===Phase 6. Ask for user prompts for things might warrant user attentions.
    // We limit the scope endpoints being deployed.
    const matchingBackend = backend.matchingBackend(wantBackend, (endpoint) => {
        return (0, functionsDeployHelper_1.endpointMatchesAnyFilter)(endpoint, context.filters);
    });
    await (0, prompts_1.promptForFailurePolicies)(options, matchingBackend, haveBackend);
    await (0, prompts_1.promptForMinInstances)(options, matchingBackend, haveBackend);
    // ===Phase 7. Finalize preparation by "fixing" all extraneous environment issues like IAM policies.
    // We limit the scope endpoints being deployed.
    await backend.checkAvailability(context, matchingBackend);
    await validate.secretsAreValid(projectId, matchingBackend);
    await (0, checkIam_1.ensureServiceAgentRoles)(projectId, projectNumber, matchingBackend, haveBackend, options.dryRun);
    await (0, checkIam_1.ensureGenkitMonitoringRoles)(projectId, projectNumber, matchingBackend, haveBackend, options.dryRun);
    await ensure.secretAccess(projectId, matchingBackend, haveBackend, options.dryRun);
    /**
     * ===Phase 8 Generates the hashes for each of the functions now that secret versions have been resolved.
     * This must be called after `await validate.secretsAreValid`.
     */
    updateEndpointTargetedStatus(wantBackends, context.filters || []);
    (0, applyHash_1.applyBackendHashToBackends)(wantBackends, context);
}
exports.prepare = prepare;
/**
 * Adds information to the want backend types based on what we can infer from prod.
 * This can help us preserve environment variables set out of band, remember the
 * location of a trigger w/o lookup, etc.
 */
function inferDetailsFromExisting(want, have, usedDotenv) {
    var _a;
    for (const wantE of backend.allEndpoints(want)) {
        const haveE = (_a = have.endpoints[wantE.region]) === null || _a === void 0 ? void 0 : _a[wantE.id];
        if (!haveE) {
            continue;
        }
        // Copy the service id over to the new endpoint.
        wantE.runServiceId = haveE.runServiceId;
        // By default, preserve existing environment variables.
        // Only overwrite environment variables when there are user specified environment variables.
        if (!usedDotenv) {
            wantE.environmentVariables = Object.assign(Object.assign({}, haveE.environmentVariables), wantE.environmentVariables);
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
exports.inferDetailsFromExisting = inferDetailsFromExisting;
function maybeCopyTriggerRegion(wantE, haveE) {
    if (!backend.isEventTriggered(wantE) || !backend.isEventTriggered(haveE)) {
        return;
    }
    if (wantE.eventTrigger.region || !haveE.eventTrigger.region) {
        return;
    }
    // Don't copy the region if anything about the trigger resource changed. It's possible
    // they changed the region
    if (JSON.stringify(haveE.eventTrigger.eventFilters) !==
        JSON.stringify(wantE.eventTrigger.eventFilters)) {
        return;
    }
    wantE.eventTrigger.region = haveE.eventTrigger.region;
}
/**
 * Determines whether endpoints are targeted by an --only flag.
 */
function updateEndpointTargetedStatus(wantBackends, endpointFilters) {
    for (const wantBackend of Object.values(wantBackends)) {
        for (const endpoint of (0, backend_1.allEndpoints)(wantBackend)) {
            endpoint.targetedByOnly = (0, functionsDeployHelper_1.endpointMatchesAnyFilter)(endpoint, endpointFilters);
        }
    }
}
exports.updateEndpointTargetedStatus = updateEndpointTargetedStatus;
/** Figures out the blocking endpoint options by taking the OR of every trigger option and reassigning that value back to the endpoint. */
function inferBlockingDetails(want) {
    var _a, _b, _c;
    const authBlockingEndpoints = backend
        .allEndpoints(want)
        .filter((ep) => backend.isBlockingTriggered(ep) &&
        v1_1.AUTH_BLOCKING_EVENTS.includes(ep.blockingTrigger.eventType));
    if (authBlockingEndpoints.length === 0) {
        return;
    }
    let accessToken = false;
    let idToken = false;
    let refreshToken = false;
    for (const blockingEp of authBlockingEndpoints) {
        accessToken || (accessToken = !!((_a = blockingEp.blockingTrigger.options) === null || _a === void 0 ? void 0 : _a.accessToken));
        idToken || (idToken = !!((_b = blockingEp.blockingTrigger.options) === null || _b === void 0 ? void 0 : _b.idToken));
        refreshToken || (refreshToken = !!((_c = blockingEp.blockingTrigger.options) === null || _c === void 0 ? void 0 : _c.refreshToken));
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
exports.inferBlockingDetails = inferBlockingDetails;
/**
 * Assigns the CPU level to a function based on its memory if CPU is not
 * provided and sets concurrency based on the CPU level if not provided.
 * After this function, CPU will be a real number and not "gcf_gen1".
 */
function resolveCpuAndConcurrency(want) {
    for (const e of backend.allEndpoints(want)) {
        if (e.platform === "gcfv1") {
            continue;
        }
        if (e.cpu === "gcf_gen1") {
            e.cpu = backend.memoryToGen1Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
        }
        else if (!e.cpu) {
            e.cpu = backend.memoryToGen2Cpu(e.availableMemoryMb || backend.DEFAULT_MEMORY);
        }
        if (!e.concurrency) {
            e.concurrency = e.cpu >= 1 ? backend.DEFAULT_CONCURRENCY : 1;
        }
    }
}
exports.resolveCpuAndConcurrency = resolveCpuAndConcurrency;
/**
 * Exported for use by an internal command (internaltesting:functions:discover) only.
 * @internal
 */
async function loadCodebases(config, options, firebaseConfig, runtimeConfig, filters) {
    const codebases = (0, functionsDeployHelper_1.targetCodebases)(config, filters);
    const projectId = (0, projectUtils_1.needProjectId)(options);
    const wantBuilds = {};
    for (const codebase of codebases) {
        const codebaseConfig = (0, projectConfig_1.configForCodebase)(config, codebase);
        const sourceDirName = codebaseConfig.source;
        if (!sourceDirName) {
            throw new error_1.FirebaseError(`No functions code detected at default location (./functions), and no functions source defined in firebase.json`);
        }
        const sourceDir = options.config.path(sourceDirName);
        const delegateContext = {
            projectId,
            sourceDir,
            projectDir: options.config.projectDir,
            runtime: codebaseConfig.runtime,
        };
        const firebaseJsonRuntime = codebaseConfig.runtime;
        if (firebaseJsonRuntime && !supported.isRuntime(firebaseJsonRuntime)) {
            throw new error_1.FirebaseError(`Functions codebase ${codebase} has invalid runtime ` +
                `${firebaseJsonRuntime} specified in firebase.json. Valid values are: \n` +
                Object.keys(supported.RUNTIMES)
                    .map((s) => `- ${s}`)
                    .join("\n"));
        }
        const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
        logger_1.logger.debug(`Validating ${runtimeDelegate.language} source`);
        supported.guardVersionSupport(runtimeDelegate.runtime);
        await runtimeDelegate.validate();
        logger_1.logger.debug(`Building ${runtimeDelegate.language} source`);
        await runtimeDelegate.build();
        const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);
        (0, utils_1.logLabeledBullet)("functions", `Loading and analyzing source code for codebase ${codebase} to determine what to deploy`);
        const discoveredBuild = await runtimeDelegate.discoverBuild(runtimeConfig, Object.assign(Object.assign({}, firebaseEnvs), { 
            // Quota project is required when using GCP's Client-based APIs
            // Some GCP client SDKs, like Vertex AI, requires appropriate quota project setup
            // in order for .init() calls to succeed.
            GOOGLE_CLOUD_QUOTA_PROJECT: projectId }));
        discoveredBuild.runtime = codebaseConfig.runtime;
        build.applyPrefix(discoveredBuild, codebaseConfig.prefix || "");
        wantBuilds[codebase] = discoveredBuild;
    }
    return wantBuilds;
}
exports.loadCodebases = loadCodebases;
// Genkit almost always requires an API key, so warn if the customer is about to deploy
// a function and doesn't have one. To avoid repetitive nagging, only warn on the first
// deploy of the function.
async function warnIfNewGenkitFunctionIsMissingSecrets(have, want, options) {
    if (options.force) {
        return;
    }
    const newAndMissingSecrets = backend.allEndpoints(backend.matchingBackend(want, (e) => {
        var _a;
        if (!backend.isCallableTriggered(e) || !e.callableTrigger.genkitAction) {
            return false;
        }
        if ((_a = e.secretEnvironmentVariables) === null || _a === void 0 ? void 0 : _a.length) {
            return false;
        }
        return !backend.hasEndpoint(have)(e);
    }));
    if (newAndMissingSecrets.length) {
        const message = `The function(s) ${newAndMissingSecrets.map((e) => e.id).join(", ")} use Genkit but do not have access to a secret. ` +
            "This may cause the function to fail if it depends on an API key. To learn more about granting a function access to " +
            "secrets, see https://firebase.google.com/docs/functions/config-env?gen=2nd#secret_parameters. Continue?";
        if (!(await prompt.confirm({ message, nonInteractive: options.nonInteractive }))) {
            throw new error_1.FirebaseError("Aborted");
        }
    }
}
exports.warnIfNewGenkitFunctionIsMissingSecrets = warnIfNewGenkitFunctionIsMissingSecrets;
// Enable required APIs. This may come implicitly from triggers (e.g. scheduled triggers
// require cloudscheduler and, in v1, require pub/sub), use of features (secrets), or explicit dependencies.
async function ensureAllRequiredAPIsEnabled(projectNumber, wantBackend) {
    await Promise.all(Object.values(wantBackend.requiredAPIs).map(({ api }) => {
        return ensureApiEnabled.ensure(projectNumber, api, "functions", /* silent=*/ false);
    }));
    if (backend.someEndpoint(wantBackend, (e) => e.platform === "gcfv2")) {
        // Note: Some of these are premium APIs that require billing to be enabled.
        // We'd eventually have to add special error handling for billing APIs, but
        // enableCloudBuild is called above and has this special casing already.
        const V2_APIS = [(0, api_1.cloudRunApiOrigin)(), (0, api_1.eventarcOrigin)(), (0, api_1.pubsubOrigin)(), (0, api_1.storageOrigin)()];
        const enablements = V2_APIS.map((api) => {
            return ensureApiEnabled.ensure(projectNumber, api, "functions");
        });
        await Promise.all(enablements);
        // Need to manually kick off the p4sa activation of services
        // that we use with IAM roles assignment.
        const services = ["pubsub.googleapis.com", "eventarc.googleapis.com"];
        const generateServiceAccounts = services.map((service) => {
            return (0, serviceusage_1.generateServiceIdentity)(projectNumber, service, "functions");
        });
        await Promise.all(generateServiceAccounts);
    }
    // If function is making use of secrets, go ahead and enable Secret Manager API.
    if (backend.someEndpoint(wantBackend, (e) => !!(e.secretEnvironmentVariables && e.secretEnvironmentVariables.length > 0))) {
        await ensureApiEnabled.ensure(projectNumber, (0, api_1.secretManagerOrigin)(), "functions", 
        /* silent=*/ false);
    }
}
exports.ensureAllRequiredAPIsEnabled = ensureAllRequiredAPIsEnabled;
