import * as api from "../api";
import { logLabeledBullet, logLabeledSuccess } from "../utils";

const VERSION = "v1beta1";

export interface Schedule {
  name: string;
  schedule: string;
  description?: string;
  timeZone?: string;
  httpTarget?: {
    uri: string;
    httpMethod: string;
  };
}

export function createJob(schedule: Schedule): Promise<void> {
  // the replace below removes the portion of the schedule name after the last /
  // ie: projects/my-proj/locations/us-central1/jobs/firebase-schedule-func-us-east1 would become
  // projects/my-proj/locations/us-central1/jobs
  const strippedName = schedule.name.replace(/\/[^\/]+$/, "");
  return api.request("POST", `/${VERSION}/${strippedName}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
    data: Object.assign({ timeZone: "America/Los_Angeles" }, schedule),
  });
}

export function deleteJob(name: string): Promise<void> {
  return api.request("DELETE", `/${VERSION}/${name}`, {
    auth: true,
    origin: api.cloudschedulerOrigin,
  });
}

export async function createOrReplaceJob(schedule: Schedule): Promise<void> {
  const jobName = `${schedule.name.split("/")[5]}`;
  try {
    await createJob(schedule);
    logLabeledSuccess("functions", `created scheduler job ${jobName}`);
  } catch (e) {
    if (e.context.response.statusCode !== 409) {
      throw e;
    }
    logLabeledBullet("functions", `re-creating scheduler job ${jobName}`);
    await deleteJob(schedule.name);
    return createJob(schedule);
  }
}
