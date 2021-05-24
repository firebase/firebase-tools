import * as _ from "lodash";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as api from "../api";
import * as proto from "./proto";

const VERSION = "v1beta1";
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
  timeZone?: string;

  // oneof target
  httpTarget?: HttpTarget;
  pubsubTarget?: PubsubTarget;
  // end oneof target

  retryConfig?: {
    retryCount?: number;
    maxRetryDuration?: string;
    minBackoffDuration?: string;
    maxBackoffDuration?: string;
    maxDoublings?: number;
  };
}

export function assertValidJob(job: Job) {
  proto.assertOneOf("Scheduler Job", job, "target", "httpTarget", "pubsubTarget");
  if (job.httpTarget) {
    proto.assertOneOf(
      "Scheduler Job",
      job.httpTarget,
      "httpTarget.authorizationHeader",
      "oauthToken",
      "odicToken"
    );
  }
}

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
  return api.request("POST", `/${VERSION}/${strippedName}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    data: Object.assign({ timeZone: DEFAULT_TIME_ZONE }, job),
  });
}

/**
 * Deletes a cloudScheduler job with the given name.
 * Returns a 404 if no job with that name exists.
 * @param name The name of the job to delete.
 */
export function deleteJob(name: string): Promise<any> {
  return api.request("DELETE", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
  });
}

/**
 * Gets a cloudScheduler job with the given name.
 * If no job with that name exists, this will return a 404.
 * @param name The name of the job to get.
 */
export function getJob(name: string): Promise<any> {
  return api.request("GET", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    resolveOnHTTPError: true,
  });
}

/**
 * Updates a cloudScheduler job.
 * Returns a 404 if no job with that name exists.
 * @param job A job to update.
 */
export function updateJob(job: Job): Promise<any> {
  // Note that name cannot be updated.
  return api.request("PATCH", `/${VERSION}/${job.name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    data: Object.assign({ timeZone: DEFAULT_TIME_ZONE }, job),
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
export async function createOrReplaceJob(job: Job): Promise<any> {
  const jobName = job.name.split("/").pop();
  const existingJob = await getJob(job.name);
  // if no job is found, create one
  if (existingJob.status === 404) {
    let newJob;
    try {
      newJob = await createJob(job);
    } catch (err) {
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
  if (isIdentical(existingJob.body, job)) {
    logger.debug(`scheduler job ${jobName} is up to date, no changes required`);
    return;
  }
  const updatedJob = await updateJob(job);
  logger.debug(`updated scheduler job ${jobName}`);
  return updatedJob;
}

/**
 * Check if two jobs are functionally equivalent.
 * @param job a job to compare.
 * @param otherJob a job to compare.
 */
function isIdentical(job: Job, otherJob: Job): boolean {
  return (
    job &&
    otherJob &&
    job.schedule === otherJob.schedule &&
    job.timeZone === otherJob.timeZone &&
    _.isEqual(job.retryConfig, otherJob.retryConfig)
  );
}
