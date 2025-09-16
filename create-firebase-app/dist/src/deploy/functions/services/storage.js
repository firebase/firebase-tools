"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStorageTriggerRegion = exports.obtainStorageBindings = void 0;
const storage = require("../../../gcp/storage");
const logger_1 = require("../../../logger");
const error_1 = require("../../../error");
const location_1 = require("../../../gcp/location");
const PUBSUB_PUBLISHER_ROLE = "roles/pubsub.publisher";
/**
 * Finds the required project level IAM bindings for the Cloud Storage service agent
 * @param projectId project identifier
 * @param existingPolicy the project level IAM policy
 */
async function obtainStorageBindings(projectNumber) {
    const storageResponse = await storage.getServiceAccount(projectNumber);
    const storageServiceAgent = `serviceAccount:${storageResponse.email_address}`;
    const pubsubPublisherBinding = {
        role: PUBSUB_PUBLISHER_ROLE,
        members: [storageServiceAgent],
    };
    return [pubsubPublisherBinding];
}
exports.obtainStorageBindings = obtainStorageBindings;
/**
 * Sets a GCS event trigger's region to the region of its bucket if unset,
 * and checks for an invalid EventArc trigger region before deployment of the function
 * @param endpoint the storage endpoint
 * @param eventTrigger the endpoints event trigger
 */
async function ensureStorageTriggerRegion(endpoint) {
    var _a;
    const { eventTrigger } = endpoint;
    if (!eventTrigger.region) {
        logger_1.logger.debug("Looking up bucket region for the storage event trigger");
        if (!((_a = eventTrigger.eventFilters) === null || _a === void 0 ? void 0 : _a.bucket)) {
            throw new error_1.FirebaseError("Error: storage event trigger is missing bucket filter: " +
                JSON.stringify(eventTrigger, null, 2));
        }
        logger_1.logger.debug(`Looking up bucket region for the storage event trigger on bucket ${eventTrigger.eventFilters.bucket}`);
        try {
            const bucket = await storage.getBucket(eventTrigger.eventFilters.bucket);
            eventTrigger.region = bucket.location.toLowerCase();
            logger_1.logger.debug("Setting the event trigger region to", eventTrigger.region, ".");
        }
        catch (err) {
            throw new error_1.FirebaseError("Can't find the storage bucket region", { original: err });
        }
    }
    // check for invalid cloud storage trigger region
    if (endpoint.region !== eventTrigger.region &&
        eventTrigger.region !== "us-central1" && // GCF allows any trigger to be in us-central1
        !(0, location_1.regionInLocation)(endpoint.region, eventTrigger.region)) {
        throw new error_1.FirebaseError(`A function in region ${endpoint.region} cannot listen to a bucket in region ${eventTrigger.region}`);
    }
}
exports.ensureStorageTriggerRegion = ensureStorageTriggerRegion;
