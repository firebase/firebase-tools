import * as _ from "lodash";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { cloudschedulerOrigin } from "../api";
import { Client } from "../apiv2";
import * as backend from "../deploy/functions/backend";
import * as proto from "./proto";
import { assertExhaustive, nullsafeVisitor } from "../functional";

const VERSION = "v1";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export interface PubsubTarget {
  topicName: string;
  data?: string;
  attributes?: Record<string, string>;
}

export type HttpMethod = "POST" | "GET" | "HEAD" | "PUT" | "DELETE" | "PATCH" | "OPTIONS";

export interface OauthToken {
  serviceAccountEmail: string;
  scope: string;
}

export interface OdicToken {
  serviceAccountEmail: string;
  audiences: string[];
}

export interface HttpTarget {
  uri: string;
  httpMethod: HttpMethod;
  headers?: Record<string, string>;
  body?: string;

  // oneof authorizationHeader
  oauthToken?: OauthToken;
  odicToken?: OdicToken;
  // end oneof authorizationHeader;
}

export interface RetryConfig {
  retryCount?: number;
  maxRetryDuration?: proto.Duration;
  maxBackoffDuration?: proto.Duration;
  maxDoublings?: number;
}

export interface Job {
  name: string;
  schedule: string;
  description?: string;
  timeZone?: string | null;

  // oneof target
  httpTarget?: HttpTarget;
  pubsubTarget?: PubsubTarget;
  // end oneof target

  retryConfig?: {
    retryCount?: number | null;
    maxRetryDuration?: string | null;
    minBackoffDuration?: string | null;
    maxBackoffDuration?: string | null;
    maxDoublings?: number | null;
  };
}

const apiClient = new Client({ urlPrefix: cloudschedulerOrigin, apiVersion: VERSION });

/**
 * Creates a cloudScheduler job.
 * If another job with that name already exists, this will return a 409.
 * @param job The job to create.
 */
export function createJob(job: Job): Promise<any> {
  // the replace below removes the portion of the schedule name after the last /
  // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
  // projects/my-proj/locations/us-central1/jobs
  const strippedName = job.name.substring(0, job.name.lastIndexOf("/"));
  return apiClient.post(`/${strippedName}`, Object.assign({ timeZone: DEFAULT_TIME_ZONE }, job));
}

/**
 * Deletes a cloudScheduler job with the given name.
 * Returns a 404 if no job with that name exists.
 * @param name The name of the job to delete.
 */
export function deleteJob(name: string): Promise<any> {
  return apiClient.delete(`/${name}`);
}

/**
 * Gets a cloudScheduler job with the given name.
 * If no job with that name exists, this will return a 404.
 * @param name The name of the job to get.
 */
export function getJob(name: string): Promise<any> {
  return apiClient.get(`/${name}`, {
    resolveOnHTTPError: true,
  });
}

/**
 * Updates a cloudScheduler job.
 * Returns a 404 if no job with that name exists.
 * @param job A job to update.
 */
export function updateJob(job: Job): Promise<any> {
  const fieldMasks = proto.fieldMasks(job, "pubsubTarget");
  return apiClient.patch(
    `/${job.name}`,
    { timeZone: DEFAULT_TIME_ZONE, ...job },
    {
      queryParams: {
        updateMask: fieldMasks.join(","),
      },
    }
  );
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
export async function createOrReplaceJob(job: Job): Promise<any> {
  const jobName = job.name.split("/").pop();
  const existingJob = await getJob(job.name);
  // if no job is found, create one
  if (existingJob.status === 404) {
    let newJob;
    try {
      newJob = await createJob(job);
    } catch (err: any) {
      // Cloud resource location is not set so we error here and exit.
      if (err?.context?.response?.statusCode === 404) {
        throw new FirebaseError(
          `Cloud resource location is not set for this project but scheduled functions require it. ` +
            `Please see this documentation for more details: https://firebase.google.com/docs/projects/locations.`
        );
      }
      throw new FirebaseError(`Failed to create scheduler job ${job.name}: ${err.message}`);
    }
    logger.debug(`created scheduler job ${jobName}`);
    return newJob;
  }
  if (!job.timeZone) {
    // We set this here to avoid recreating schedules that use the default timeZone
    job.timeZone = DEFAULT_TIME_ZONE;
  }
  if (!needUpdate(existingJob.body, job)) {
    logger.debug(`scheduler job ${jobName} is up to date, no changes required`);
    return;
  }
  const updatedJob = await updateJob(job);
  logger.debug(`updated scheduler job ${jobName}`);
  return updatedJob;
}

/**
 * Check if two jobs are functionally equivalent.
 * @param existingJob a job to compare.
 * @param newJob a job to compare.
 */
function needUpdate(existingJob: Job, newJob: Job): boolean {
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
export function jobNameForEndpoint(
  endpoint: backend.Endpoint & backend.ScheduleTriggered,
  appEngineLocation: string
): string {
  const id = backend.scheduleIdForFunction(endpoint);
  return `projects/${endpoint.project}/locations/${appEngineLocation}/jobs/${id}`;
}

/** The name of the pubsub topic that the Cloud Scheduler job will use for this endpoint. */
export function topicNameForEndpoint(
  endpoint: backend.Endpoint & backend.ScheduleTriggered
): string {
  const id = backend.scheduleIdForFunction(endpoint);
  return `projects/${endpoint.project}/topics/${id}`;
}

/** Converts an Endpoint to a CloudScheduler v1 job */
export function jobFromEndpoint(
  endpoint: backend.Endpoint & backend.ScheduleTriggered,
  appEngineLocation: string
): Job {
  const job: Partial<Job> = {};
  if (endpoint.platform === "gcfv1") {
    job.name = jobNameForEndpoint(endpoint, appEngineLocation);
    job.pubsubTarget = {
      topicName: topicNameForEndpoint(endpoint),
      attributes: {
        scheduled: "true",
      },
    };
  } else if (endpoint.platform === "gcfv2") {
    // NB: We should figure out whether there's a good service account we can use
    // to get ODIC tokens from while invoking the function. Hopefully either
    // CloudScheduler has an account we can use or we can use the default compute
    // account credentials (it's a project editor, so it should have permissions
    // to invoke a function and editor deployers should have permission to actAs
    // it)
    throw new FirebaseError("Do not know how to create a scheduled GCFv2 function");
  } else {
    assertExhaustive(endpoint.platform);
  }
  if (!endpoint.scheduleTrigger.schedule) {
    throw new FirebaseError(
      "Cannot create a scheduler job without a schedule:" + JSON.stringify(endpoint)
    );
  }
  job.schedule = endpoint.scheduleTrigger.schedule;
  job.timeZone = endpoint.scheduleTrigger.timeZone || DEFAULT_TIME_ZONE;
  if (endpoint.scheduleTrigger.retryConfig) {
    job.retryConfig = {};
    proto.copyIfPresent(
      job.retryConfig,
      endpoint.scheduleTrigger.retryConfig,
      "maxDoublings",
      "retryCount"
    );
    proto.convertIfPresent(
      job.retryConfig,
      endpoint.scheduleTrigger.retryConfig,
      "maxBackoffDuration",
      "maxBackoffSeconds",
      nullsafeVisitor(proto.durationFromSeconds)
    );
    proto.convertIfPresent(
      job.retryConfig,
      endpoint.scheduleTrigger.retryConfig,
      "minBackoffDuration",
      "minBackoffSeconds",
      nullsafeVisitor(proto.durationFromSeconds)
    );
    proto.convertIfPresent(
      job.retryConfig,
      endpoint.scheduleTrigger.retryConfig,
      "maxRetryDuration",
      "maxRetrySeconds",
      nullsafeVisitor(proto.durationFromSeconds)
    );
    // If no retry configuration exists, delete the key to preserve existing retry config.
    if (!Object.keys(job.retryConfig).length) {
      delete job.retryConfig;
    }
  }

  // TypeScript compiler isn't noticing that name is defined in all code paths.
  return job as Job;
}
