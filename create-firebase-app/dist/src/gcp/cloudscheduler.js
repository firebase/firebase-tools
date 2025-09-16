"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobFromEndpoint = exports.topicNameForEndpoint = exports.jobNameForEndpoint = exports.createOrReplaceJob = exports.getJob = exports.deleteJob = void 0;
const _ = require("lodash");
const error_1 = require("../error");
const logger_1 = require("../logger");
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const backend = require("../deploy/functions/backend");
const proto = require("./proto");
const gce = require("../gcp/computeEngine");
const functional_1 = require("../functional");
const VERSION = "v1";
const DEFAULT_TIME_ZONE_V1 = "America/Los_Angeles";
const DEFAULT_TIME_ZONE_V2 = "UTC";
const apiClient = new apiv2_1.Client({ urlPrefix: (0, api_1.cloudschedulerOrigin)(), apiVersion: VERSION });
/**
 * Creates a cloudScheduler job.
 * If another job with that name already exists, this will return a 409.
 * @param job The job to create.
 */
function createJob(job) {
    // the replace below removes the portion of the schedule name after the last /
    // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
    // projects/my-proj/locations/us-central1/jobs
    const strippedName = job.name.substring(0, job.name.lastIndexOf("/"));
    const json = job.pubsubTarget
        ? Object.assign({ timeZone: DEFAULT_TIME_ZONE_V1 }, job) : Object.assign({ timeZone: DEFAULT_TIME_ZONE_V2 }, job);
    return apiClient.post(`/${strippedName}`, json);
}
/**
 * Deletes a cloudScheduler job with the given name.
 * Returns a 404 if no job with that name exists.
 * @param name The name of the job to delete.
 */
function deleteJob(name) {
    return apiClient.delete(`/${name}`);
}
exports.deleteJob = deleteJob;
/**
 * Gets a cloudScheduler job with the given name.
 * If no job with that name exists, this will return a 404.
 * @param name The name of the job to get.
 */
function getJob(name) {
    return apiClient.get(`/${name}`, {
        resolveOnHTTPError: true,
    });
}
exports.getJob = getJob;
/**
 * Updates a cloudScheduler job.
 * Returns a 404 if no job with that name exists.
 * @param job A job to update.
 */
function updateJob(job) {
    let fieldMasks;
    let json;
    if (job.pubsubTarget) {
        // v1 uses pubsub
        fieldMasks = proto.fieldMasks(job, "pubsubTarget");
        json = Object.assign({ timeZone: DEFAULT_TIME_ZONE_V1 }, job);
    }
    else {
        // v2 uses http
        fieldMasks = proto.fieldMasks(job, "httpTarget");
        json = Object.assign({ timeZone: DEFAULT_TIME_ZONE_V2 }, job);
    }
    return apiClient.patch(`/${job.name}`, json, {
        queryParams: {
            updateMask: fieldMasks.join(","),
        },
    });
}
/**
 * Checks for a existing job with the given name.
 * If none is found, it creates a new job.
 * If one is found, and it is identical to the job parameter, it does nothing.
 * Otherwise, if one is found and it is different from the job param, it updates the job.
 * @param job A job to check for and create, replace, or leave as appropriate.
 * @throws { FirebaseError } if an error response other than 404 is received on the GET call
 * or if error response 404 is received on the POST call, indicating that cloud resource
 * location is not set.
 */
async function createOrReplaceJob(job) {
    var _a, _b;
    const jobName = job.name.split("/").pop();
    const existingJob = await getJob(job.name);
    // if no job is found, create one
    if (existingJob.status === 404) {
        let newJob;
        try {
            newJob = await createJob(job);
        }
        catch (err) {
            // Cloud resource location is not set so we error here and exit.
            if (((_b = (_a = err === null || err === void 0 ? void 0 : err.context) === null || _a === void 0 ? void 0 : _a.response) === null || _b === void 0 ? void 0 : _b.statusCode) === 404) {
                throw new error_1.FirebaseError(`Cloud resource location is not set for this project but scheduled functions require it. ` +
                    `Please see this documentation for more details: https://firebase.google.com/docs/projects/locations.`);
            }
            throw new error_1.FirebaseError(`Failed to create scheduler job ${job.name}: ${err.message}`);
        }
        logger_1.logger.debug(`created scheduler job ${jobName}`);
        return newJob;
    }
    if (!job.timeZone) {
        // We set this here to avoid recreating schedules that use the default timeZone
        job.timeZone = job.pubsubTarget ? DEFAULT_TIME_ZONE_V1 : DEFAULT_TIME_ZONE_V2;
    }
    if (!needUpdate(existingJob.body, job)) {
        logger_1.logger.debug(`scheduler job ${jobName} is up to date, no changes required`);
        return;
    }
    const updatedJob = await updateJob(job);
    logger_1.logger.debug(`updated scheduler job ${jobName}`);
    return updatedJob;
}
exports.createOrReplaceJob = createOrReplaceJob;
/**
 * Check if two jobs are functionally equivalent.
 * @param existingJob a job to compare.
 * @param newJob a job to compare.
 */
function needUpdate(existingJob, newJob) {
    if (!existingJob) {
        return true;
    }
    if (!newJob) {
        return true;
    }
    if (existingJob.schedule !== newJob.schedule) {
        return true;
    }
    if (existingJob.timeZone !== newJob.timeZone) {
        return true;
    }
    if (newJob.retryConfig) {
        if (!existingJob.retryConfig) {
            return true;
        }
        if (!_.isMatch(existingJob.retryConfig, newJob.retryConfig)) {
            return true;
        }
    }
    return false;
}
/** The name of the Cloud Scheduler job we will use for this endpoint. */
function jobNameForEndpoint(endpoint, location) {
    const id = backend.scheduleIdForFunction(endpoint);
    return `projects/${endpoint.project}/locations/${location}/jobs/${id}`;
}
exports.jobNameForEndpoint = jobNameForEndpoint;
/** The name of the pubsub topic that the Cloud Scheduler job will use for this endpoint. */
function topicNameForEndpoint(endpoint) {
    const id = backend.scheduleIdForFunction(endpoint);
    return `projects/${endpoint.project}/topics/${id}`;
}
exports.topicNameForEndpoint = topicNameForEndpoint;
/** Converts an Endpoint to a CloudScheduler v1 job */
async function jobFromEndpoint(endpoint, location, projectNumber) {
    var _a;
    const job = {};
    job.name = jobNameForEndpoint(endpoint, location);
    if (endpoint.platform === "gcfv1") {
        job.timeZone = endpoint.scheduleTrigger.timeZone || DEFAULT_TIME_ZONE_V1;
        job.pubsubTarget = {
            topicName: topicNameForEndpoint(endpoint),
            attributes: {
                scheduled: "true",
            },
        };
    }
    else if (endpoint.platform === "gcfv2" || endpoint.platform === "run") {
        job.timeZone = endpoint.scheduleTrigger.timeZone || DEFAULT_TIME_ZONE_V2;
        job.httpTarget = {
            uri: endpoint.uri,
            httpMethod: "POST",
            oidcToken: {
                serviceAccountEmail: (_a = endpoint.serviceAccount) !== null && _a !== void 0 ? _a : (await gce.getDefaultServiceAccount(projectNumber)),
            },
        };
    }
    else {
        (0, functional_1.assertExhaustive)(endpoint.platform);
    }
    if (!endpoint.scheduleTrigger.schedule) {
        throw new error_1.FirebaseError("Cannot create a scheduler job without a schedule:" + JSON.stringify(endpoint));
    }
    job.schedule = endpoint.scheduleTrigger.schedule;
    if (endpoint.scheduleTrigger.retryConfig) {
        job.retryConfig = {};
        proto.copyIfPresent(job.retryConfig, endpoint.scheduleTrigger.retryConfig, "maxDoublings", "retryCount");
        proto.convertIfPresent(job.retryConfig, endpoint.scheduleTrigger.retryConfig, "maxBackoffDuration", "maxBackoffSeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
        proto.convertIfPresent(job.retryConfig, endpoint.scheduleTrigger.retryConfig, "minBackoffDuration", "minBackoffSeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
        proto.convertIfPresent(job.retryConfig, endpoint.scheduleTrigger.retryConfig, "maxRetryDuration", "maxRetrySeconds", (0, functional_1.nullsafeVisitor)(proto.durationFromSeconds));
        // If no retry configuration exists, delete the key to preserve existing retry config.
        if (!Object.keys(job.retryConfig).length) {
            delete job.retryConfig;
        }
    }
    // TypeScript compiler isn't noticing that name is defined in all code paths.
    return job;
}
exports.jobFromEndpoint = jobFromEndpoint;
