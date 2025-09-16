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
exports.generateServiceIdentityAndPoll = exports.generateServiceIdentity = exports.apiClient = void 0;
const colorette_1 = require("colorette");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const utils = __importStar(require("../utils"));
const poller = __importStar(require("../operation-poller"));
const API_VERSION = "v1beta1";
const SERVICE_USAGE_ORIGIN = (0, api_1.serviceUsageOrigin)();
exports.apiClient = new apiv2_1.Client({
    urlPrefix: SERVICE_USAGE_ORIGIN,
    apiVersion: API_VERSION,
});
const serviceUsagePollerOptions = {
    apiOrigin: SERVICE_USAGE_ORIGIN,
    apiVersion: API_VERSION,
};
/**
 * Generate the service account for the service. Note: not every service uses the endpoint.
 * @param projectNumber gcp project number
 * @param service the service api (ex~ pubsub.googleapis.com)
 * @return Promise<LongRunningOperation>
 */
async function generateServiceIdentity(projectNumber, service, prefix) {
    utils.logLabeledBullet(prefix, `generating the service identity for ${(0, colorette_1.bold)(service)}...`);
    try {
        const res = await exports.apiClient.post(`projects/${projectNumber}/services/${service}:generateServiceIdentity`, 
        /* body=*/ {}, { headers: { "x-goog-quota-user": `projects/${projectNumber}` } });
        return res.body;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Error generating the service identity for ${service}.`, {
            original: err,
        });
    }
}
exports.generateServiceIdentity = generateServiceIdentity;
/**
 * Calls GenerateServiceIdentity and polls till the operation is complete.
 */
async function generateServiceIdentityAndPoll(projectNumber, service, prefix) {
    const op = await generateServiceIdentity(projectNumber, service, prefix);
    /**
     * Note: generateServiceIdenity seems to return a DONE operation with an
     * operation name of "finished.DONE_OPERATION" and querying the operation
     * returns a 400 error. As a workaround we check if the operation is DONE
     * before beginning to poll.
     */
    if (op.done) {
        return;
    }
    await poller.pollOperation({
        ...serviceUsagePollerOptions,
        operationResourceName: op.name,
        headers: { "x-goog-quota-user": `projects/${projectNumber}` },
    });
}
exports.generateServiceIdentityAndPoll = generateServiceIdentityAndPoll;
//# sourceMappingURL=serviceusage.js.map