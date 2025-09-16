"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureServiceAgentRoles = exports.ensureGenkitMonitoringRoles = exports.obtainDefaultComputeServiceAgentBindings = exports.obtainPubSubServiceAgentBindings = exports.checkHttpIam = exports.checkServiceAccountIam = exports.GENKIT_MONITORING_ROLES = exports.EVENTARC_EVENT_RECEIVER_ROLE = exports.RUN_INVOKER_ROLE = exports.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE = void 0;
const colorette_1 = require("colorette");
const logger_1 = require("../../logger");
const functionsDeployHelper_1 = require("./functionsDeployHelper");
const error_1 = require("../../error");
const functional_1 = require("../../functional");
const iam = __importStar(require("../../gcp/iam"));
const gce = __importStar(require("../../gcp/computeEngine"));
const backend = __importStar(require("./backend"));
const track_1 = require("../../track");
const utils = __importStar(require("../../utils"));
const resourceManager_1 = require("../../gcp/resourceManager");
const services_1 = require("./services");
const PERMISSION = "cloudfunctions.functions.setIamPolicy";
exports.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE = "roles/iam.serviceAccountTokenCreator";
exports.RUN_INVOKER_ROLE = "roles/run.invoker";
exports.EVENTARC_EVENT_RECEIVER_ROLE = "roles/eventarc.eventReceiver";
exports.GENKIT_MONITORING_ROLES = [
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
];
/**
 * Checks to see if the authenticated account has `iam.serviceAccounts.actAs` permissions
 * on a specified project (required for functions deployments).
 * @param projectId The project ID to check.
 */
async function checkServiceAccountIam(projectId) {
    const saEmail = `${projectId}@appspot.gserviceaccount.com`;
    let passed = false;
    try {
        const iamResult = await iam.testResourceIamPermissions("https://iam.googleapis.com", "v1", `projects/${projectId}/serviceAccounts/${saEmail}`, ["iam.serviceAccounts.actAs"]);
        passed = iamResult.passed;
    }
    catch (err) {
        logger_1.logger.debug("[functions] service account IAM check errored, deploy may fail:", err);
        // we want to fail this check open and not rethrow since it's informational only
        return;
    }
    if (!passed) {
        throw new error_1.FirebaseError(`Missing permissions required for functions deploy. You must have permission ${(0, colorette_1.bold)("iam.serviceAccounts.ActAs")} on service account ${(0, colorette_1.bold)(saEmail)}.\n\n` +
            `To address this error, ask a project Owner to assign your account the "Service Account User" role from this URL:\n\n` +
            `https://console.cloud.google.com/iam-admin/iam?project=${projectId}`);
    }
}
exports.checkServiceAccountIam = checkServiceAccountIam;
/**
 * Checks a functions deployment for HTTP function creation, and tests IAM
 * permissions accordingly.
 *
 * @param context The deploy context.
 * @param options The command-wide options object.
 * @param payload The deploy payload.
 */
async function checkHttpIam(context, options, payload) {
    if (!payload.functions) {
        return;
    }
    const filters = context.filters || (0, functionsDeployHelper_1.getEndpointFilters)(options);
    const wantBackends = Object.values(payload.functions).map(({ wantBackend }) => wantBackend);
    const httpEndpoints = [...(0, functional_1.flattenArray)(wantBackends.map((b) => backend.allEndpoints(b)))]
        .filter(backend.isHttpsTriggered)
        .filter((f) => (0, functionsDeployHelper_1.endpointMatchesAnyFilter)(f, filters));
    const existing = await backend.existingBackend(context);
    const newHttpsEndpoints = httpEndpoints.filter(backend.missingEndpoint(existing));
    if (newHttpsEndpoints.length === 0) {
        return;
    }
    logger_1.logger.debug("[functions] found", newHttpsEndpoints.length, "new HTTP functions, testing setIamPolicy permission...");
    let passed = true;
    try {
        const iamResult = await iam.testIamPermissions(context.projectId, [PERMISSION]);
        passed = iamResult.passed;
    }
    catch (e) {
        logger_1.logger.debug("[functions] failed http create setIamPolicy permission check. deploy may fail:", e);
        // fail open since this is an informational check
        return;
    }
    if (!passed) {
        void (0, track_1.trackGA4)("error", {
            error_type: "Error (User)",
            details: "deploy:functions:http_create_missing_iam",
        });
        throw new error_1.FirebaseError(`Missing required permission on project ${(0, colorette_1.bold)(context.projectId)} to deploy new HTTPS functions. The permission ${(0, colorette_1.bold)(PERMISSION)} is required to deploy the following functions:\n\n- ` +
            newHttpsEndpoints.map((func) => func.id).join("\n- ") +
            `\n\nTo address this error, please ask a project Owner to assign your account the "Cloud Functions Admin" role at the following URL:\n\nhttps://console.cloud.google.com/iam-admin/iam?project=${context.projectId}`);
    }
    logger_1.logger.debug("[functions] found setIamPolicy permission, proceeding with deploy");
}
exports.checkHttpIam = checkHttpIam;
/** obtain the pubsub service agent */
function getPubsubServiceAgent(projectNumber) {
    return `service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`;
}
/** Callback reducer function */
function reduceEventsToServices(services, endpoint) {
    const service = (0, services_1.serviceForEndpoint)(endpoint);
    if (service.requiredProjectBindings && !services.find((s) => s.name === service.name)) {
        services.push(service);
    }
    return services;
}
/** Checks whether the given endpoint is a Genkit callable function. */
function isGenkitEndpoint(endpoint) {
    return (backend.isCallableTriggered(endpoint) && endpoint.callableTrigger.genkitAction !== undefined);
}
/**
 * Finds the required project level IAM bindings for the Pub/Sub service agent.
 * If the user enabled Pub/Sub on or before April 8, 2021, then we must enable the token creator role.
 * @param projectNumber project number
 * @param existingPolicy the project level IAM policy
 */
function obtainPubSubServiceAgentBindings(projectNumber) {
    const serviceAccountTokenCreatorBinding = {
        role: exports.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: [`serviceAccount:${getPubsubServiceAgent(projectNumber)}`],
    };
    return [serviceAccountTokenCreatorBinding];
}
exports.obtainPubSubServiceAgentBindings = obtainPubSubServiceAgentBindings;
/**
 * Finds the required project level IAM bindings for the default compute service agent.
 * Before a user creates an EventArc trigger, this agent must be granted the invoker and event receiver roles.
 * @param projectNumber project number
 * @param existingPolicy the project level IAM policy
 */
async function obtainDefaultComputeServiceAgentBindings(projectNumber) {
    const defaultComputeServiceAgent = `serviceAccount:${await gce.getDefaultServiceAccount(projectNumber)}`;
    const runInvokerBinding = {
        role: exports.RUN_INVOKER_ROLE,
        members: [defaultComputeServiceAgent],
    };
    const eventarcEventReceiverBinding = {
        role: exports.EVENTARC_EVENT_RECEIVER_ROLE,
        members: [defaultComputeServiceAgent],
    };
    return [runInvokerBinding, eventarcEventReceiverBinding];
}
exports.obtainDefaultComputeServiceAgentBindings = obtainDefaultComputeServiceAgentBindings;
/**
 * Checks and sets the roles for any genkit deployed functions that are required
 * for Firebase Genkit Monitoring.
 * @param projectId human readable project id
 * @param projectNumber project number
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
async function ensureGenkitMonitoringRoles(projectId, projectNumber, want, have, dryRun) {
    const wantEndpoints = backend.allEndpoints(want).filter(isGenkitEndpoint);
    const newEndpoints = wantEndpoints.filter(backend.missingEndpoint(have));
    if (newEndpoints.length === 0) {
        return;
    }
    const serviceAccounts = newEndpoints
        .map((endpoint) => endpoint.serviceAccount || "")
        .filter((value, index, self) => self.indexOf(value) === index);
    const defaultServiceAccountIndex = serviceAccounts.indexOf("");
    if (defaultServiceAccountIndex !== -1) {
        serviceAccounts[defaultServiceAccountIndex] = await gce.getDefaultServiceAccount(projectNumber);
    }
    const members = serviceAccounts.filter((sa) => !!sa).map((sa) => `serviceAccount:${sa}`);
    const requiredBindings = [];
    for (const monitoringRole of exports.GENKIT_MONITORING_ROLES) {
        requiredBindings.push({
            role: monitoringRole,
            members: members,
        });
    }
    await ensureBindings(projectId, projectNumber, requiredBindings, newEndpoints.map((endpoint) => endpoint.id), dryRun);
}
exports.ensureGenkitMonitoringRoles = ensureGenkitMonitoringRoles;
/**
 * Checks and sets the roles for specific resource service agents
 * @param projectId human readable project id
 * @param projectNumber project number
 * @param want backend that we want to deploy
 * @param have backend that we have currently deployed
 */
async function ensureServiceAgentRoles(projectId, projectNumber, want, have, dryRun) {
    // find new services
    const wantServices = backend.allEndpoints(want).reduce(reduceEventsToServices, []);
    const haveServices = backend.allEndpoints(have).reduce(reduceEventsToServices, []);
    const newServices = wantServices.filter((wantS) => !haveServices.find((haveS) => wantS.name === haveS.name));
    if (newServices.length === 0) {
        return;
    }
    // obtain all the bindings we need to have active in the project
    const requiredBindingsPromises = [];
    for (const service of newServices) {
        requiredBindingsPromises.push(service.requiredProjectBindings(projectNumber));
    }
    const nestedRequiredBindings = await Promise.all(requiredBindingsPromises);
    const requiredBindings = [...(0, functional_1.flattenArray)(nestedRequiredBindings)];
    if (haveServices.length === 0) {
        requiredBindings.push(...obtainPubSubServiceAgentBindings(projectNumber));
        requiredBindings.push(...(await obtainDefaultComputeServiceAgentBindings(projectNumber)));
    }
    if (requiredBindings.length === 0) {
        return;
    }
    await ensureBindings(projectId, projectNumber, requiredBindings, newServices.map((service) => service.api), dryRun);
}
exports.ensureServiceAgentRoles = ensureServiceAgentRoles;
async function ensureBindings(projectId, projectNumber, requiredBindings, newServicesOrEndpoints, dryRun) {
    // get the full project iam policy
    let policy;
    try {
        policy = await (0, resourceManager_1.getIamPolicy)(projectNumber);
    }
    catch (err) {
        iam.printManualIamConfig(requiredBindings, projectId, "functions");
        utils.logLabeledBullet("functions", "Could not verify the necessary IAM configuration for the following newly-integrated services: " +
            `${newServicesOrEndpoints.join(", ")}` +
            ". Deployment may fail.", "warn");
        return;
    }
    const hasUpdatedBindings = iam.mergeBindings(policy, requiredBindings);
    if (!hasUpdatedBindings) {
        return;
    }
    // set the updated policy
    try {
        if (dryRun) {
            logger_1.logger.info(`On your next deploy, the following required roles will be granted: ${requiredBindings.map((b) => `${b.members.join(", ")}: ${(0, colorette_1.bold)(b.role)}`)}`);
        }
        else {
            await (0, resourceManager_1.setIamPolicy)(projectNumber, policy, "bindings");
        }
    }
    catch (err) {
        iam.printManualIamConfig(requiredBindings, projectId, "functions");
        throw new error_1.FirebaseError("We failed to modify the IAM policy for the project. The functions " +
            "deployment requires specific roles to be granted to service agents," +
            " otherwise the deployment will fail.", { original: err });
    }
}
//# sourceMappingURL=checkIam.js.map