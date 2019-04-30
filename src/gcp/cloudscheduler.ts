import { isEqual } from "lodash";
import * as api from "../api";
import { logLabeledBullet, logLabeledSuccess } from "../utils";

const VERSION = "v1beta1";

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
/*
* createJob creates a cloudScheduler job
* @returns a response from the cloud scheduler api
* If another job with that name already exists, this will return a 409
*/
export function createJob(job: Job): Promise<void> {
  // the replace below removes the portion of the schedule name after the last /
  // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
  // projects/my-proj/locations/us-central1/jobs
  const strippedName = job.name.replace(/\/[^\/]+$/, "");
  return api.request("POST", `/${VERSION}/${strippedName}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    data: Object.assign({ timeZone: "America/Los_Angeles" }, job),
  });
}

/*
* createJob delete a cloudScheduler job with the given name
* @returns a response from the cloud scheduler api
* If no job with that name exists, this will return a 404
*/
export function deleteJob(name: string): Promise<void> {
  return api.request("DELETE", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
  });
}

/*
* getJob gets a cloudScheduler job with the given name
* @returns a response from the cloud scheduler api
* If no job with that name exists, this will return a 404
*/
export function getJob(name: string): Promise<any> {
  return api.request("GET", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
  });
}

/*
* updateJob updates a cloudScheduler job
* @returns a response from the cloud scheduler api
* If no job with that name exists, this will return a 404
*/
export function updateJob(job: Job): Promise<any> {
  return api.request("PATCH", `/${VERSION}/${job.name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    data: Object.assign({ timeZone: "America/Los_Angeles" }, job),
  });
}

/*
* createOrReplaceJob checks for a existing job with the given name
* if none is found, it creates a new job
* if one is found, and it is identical to the job parameter, it does nothing
* otherwise, if one is found and it is different from the job param, it updates the job
*/
export async function createOrReplaceJob(job: Job): Promise<any> {
  const jobName = `${job.name.split("/")[5]}`;
  try {
    const existingJob = await getJob(job.name);
    if (!job.timeZone) {
      // We set this here to avoid recreating schedules that use the default timeZone
      job.timeZone = "America/Los_Angeles";
    }

    if (_isIdentical(existingJob.body, job)) {
      logLabeledBullet("functions", `scheduler job ${jobName} is up to date, no changes required`);
      return;
    } else {
      logLabeledBullet("functions", `updating scheduler job ${jobName}`);
      return updateJob(job);
    }
  } catch (e) {
    // if the error status is 404, no job exists, so we can create one
    // if it is anything else, we should error out
    if (e && e.context && e.context.response && e.context.response.statusCode !== 404) {
      throw e;
    }
    await createJob(job);
    logLabeledSuccess("functions", `created scheduler job ${jobName}`);
  }
}

/*
* _isIdentical is a helper function to check if 2 jobs are funcitonally equivalent
*/
function _isIdentical(existingJob: Job, newJob: Job): boolean {
  return (
    existingJob &&
    existingJob.schedule === newJob.schedule &&
    existingJob.timeZone === newJob.timeZone &&
    isEqual(existingJob.retryConfig, newJob.retryConfig)
  );
}
