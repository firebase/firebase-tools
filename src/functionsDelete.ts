import * as helper from "./deploy/functions/functionsDeployHelper";
import { Queue } from "./throttler/queue";
import * as tasks from "./deploy/functions/tasks";
import { DeploymentTimer } from "./deploy/functions/deploymentTimer";
import { ErrorHandler } from "./deploy/functions/errorHandler";
import * as backend from "./deploy/functions/backend";

/** delete functions, schedules, and topics. */
export async function deleteFunctions(
  functionsToDelete: backend.FunctionSpec[],
  schedulesToDelete: backend.ScheduleSpec[],
  topicsToDelete: backend.PubSubSpec[],
  appEngineLocation: string
): Promise<void> {
  const timer = new DeploymentTimer();
  const errorHandler = new ErrorHandler();
  const cloudFunctionsQueue = new Queue<tasks.DeploymentTask, void>({
    handler: tasks.functionsDeploymentHandler(timer, errorHandler),
    retries: 30,
    backoff: 10000,
    concurrency: 40,
    maxBackoff: 40000,
  });
  const schedulerQueue = new Queue<tasks.DeploymentTask, void>({
    handler: tasks.schedulerDeploymentHandler(errorHandler),
  });
  const topicQueue = new Queue<tasks.DeploymentTask, void>({
    handler: tasks.schedulerDeploymentHandler(errorHandler),
  });

  functionsToDelete.forEach((fn) => {
    const taskParams = {
      projectId: fn.project,
      errorHandler,
    };
    const deleteFunctionTask = tasks.deleteFunctionTask(taskParams, fn);
    void cloudFunctionsQueue.run(deleteFunctionTask);
  });
  schedulesToDelete.forEach((schedule) => {
    const taskParams = {
      projectId: schedule.project,
      errorHandler,
    };
    const deleteSchedulerTask = tasks.deleteScheduleTask(taskParams, schedule, appEngineLocation);
    void schedulerQueue.run(deleteSchedulerTask);
  });
  topicsToDelete.forEach((topic) => {
    const taskParams = {
      projectId: topic.project,
      errorHandler,
    };
    const deleteTopicTask = tasks.deleteTopicTask(taskParams, topic);
    void topicQueue.run(deleteTopicTask);
  });
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait(), topicQueue.wait()];

  cloudFunctionsQueue.close();
  schedulerQueue.close();
  topicQueue.close();
  cloudFunctionsQueue.process();
  schedulerQueue.process();
  topicQueue.process();

  await Promise.all(queuePromises);

  helper.logAndTrackDeployStats(cloudFunctionsQueue, errorHandler);
  errorHandler.printErrors();
}
