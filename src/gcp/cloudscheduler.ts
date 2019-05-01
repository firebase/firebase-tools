import { isEqual } from "lodash";
import * as api from "../api";
import { logLabeledBullet, logLabeledSuccess } from "../utils";

const VERSION = "v1beta1";
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export interface Job {
  name: string;
  schedule: string;
  description?: string;
  timeZone?: string;
  httpTarget?: {
    uri: string;
    httpMethod: string;
  };
  retryConfig?: {
    retryCount?: number;
    maxRetryDuration?: string;
    minBackoffDuration?: string;
    maxBackoffDuration?: string;
    maxDoublings?: number;
  };
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
  const strippedName = job.name.replace(/\/[^\/]+$/, "");
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
  });
}

/**
 * Updates a cloudScheduler job.
 * Returns a 404 if no job with that name exists.
 * @param job A job to update. Note that name cannot be updated.
 */
export function updateJob(job: Job): Promise<any> {
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
 * @throws { FirebaseError } if an error respnse other than 404 is recieved on the GET call.
 */
export async function createOrReplaceJob(job: Job): Promise<any> {
  const jobName = `${job.name.split("/")[5]}`;
  try {
    const existingJob = await getJob(job.name);
    if (!job.timeZone) {
      // We set this here to avoid recreating schedules that use the default timeZone
      job.timeZone = DEFAULT_TIME_ZONE;
    }

    if (isIdentical(existingJob.body, job)) {
      logLabeledBullet("functions", `scheduler job ${jobName} is up to date, no changes required`);
      return;
    } else {
      const updatedJob = await updateJob(job);
      logLabeledBullet("functions", `updated scheduler job ${jobName}`);
      return updatedJob;
    }
  } catch (e) {
    // If the error status is 404, no job exists, so we can create one
    // If it is anything else, we should error out
    if (e && e.context && e.context.response && e.context.response.statusCode !== 404) {
      throw e;
    }
    const newJob = await createJob(job);
    logLabeledSuccess("functions", `created scheduler job ${jobName}`);
    return newJob;
  }
}

/**
 * Check if two jobs are functionally equivalent.
 * @param existingJob a job to compare.
 * @param newJob a job to compare.
 */
function isIdentical(existingJob: Job, newJob: Job): boolean {
  return (
    existingJob &&
    existingJob.schedule === newJob.schedule &&
    existingJob.timeZone === newJob.timeZone &&
    isEqual(existingJob.retryConfig, newJob.retryConfig)
  );
}
