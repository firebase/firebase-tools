"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateServiceIdentityAndPoll = exports.generateServiceIdentity = exports.apiClient = void 0;
const colorette_1 = require("colorette");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const utils = require("../utils");
const poller = require("../operation-poller");
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
    await poller.pollOperation(Object.assign(Object.assign({}, serviceUsagePollerOptions), { operationResourceName: op.name, headers: { "x-goog-quota-user": `projects/${projectNumber}` } }));
}
exports.generateServiceIdentityAndPoll = generateServiceIdentityAndPoll;
