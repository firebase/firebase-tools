import * as _ from "lodash";
import { check, ensure } from "../../ensureApiEnabled";
import { getScheduleName, getTopicName } from "../../functionsDeployHelper";
import { createOrReplaceJob, deleteJob } from "../../gcp/cloudscheduler";
import { deleteTopic } from "../../gcp/pubsub";

interface ScheduleTrigger {
  name: string;
  schedule?: object;
}

export async function createOrUpdateSchedulesAndTopics(
  projectId: string,
  triggers: ScheduleTrigger[],
  existingScheduledFunctions: string[],
  appEngineLocation: string
): Promise<void> {
  const triggersWithSchedules = triggers.filter((t) => !!t.schedule);
  let schedulerEnabled = false;
  if (triggersWithSchedules.length) {
    await Promise.all([
      ensure(projectId, "cloudscheduler.googleapis.com", "scheduler", false),
      ensure(projectId, "pubsub.googleapis.com", "pubsub", false),
    ]);
    schedulerEnabled = true;
  } else if (existingScheduledFunctions.length) {
    schedulerEnabled = await check(projectId, "cloudscheduler.googleapis.com", "scheduler", false);
  }
  for (const trigger of triggers) {
    const [, , , region, , functionName] = trigger.name.split("/");
    const scheduleName = getScheduleName(trigger.name, appEngineLocation);
    const topicName = getTopicName(trigger.name);
    if (!trigger.schedule) {
      if (schedulerEnabled && _.includes(existingScheduledFunctions, trigger.name)) {
        // we need to delete any schedules that exist for functions that are being deployed without a schedule
        try {
          await deleteJob(scheduleName);
        } catch (err) {
          // If its a 404 error, there was no schedule to delete, so catch the error
          if (err.context.response.statusCode !== 404) {
            // If its any other statusCode, we hit an unexpected error, so rethrow it
            throw err;
          }
        }
        try {
          await deleteTopic(topicName);
        } catch (err) {
          // If its a 404 error, there was no topic to delete
          if (err.context.response.statusCode !== 404) {
            // If its any other statusCode, we hit an unexpected error, so rethrow it
            throw err;
          }
        }
      }
    } else {
      await createOrReplaceJob(
        Object.assign(trigger.schedule as { schedule: string }, {
          name: `projects/${projectId}/locations/${appEngineLocation}/jobs/firebase-schedule-${functionName}-${region}`,
          pubsubTarget: {
            topicName: `projects/${projectId}/topics/firebase-schedule-${functionName}-${region}`,
            attributes: {
              scheduled: "true",
            },
          },
        })
      );
    }
  }
  return;
}
