import * as helper from "./functionsDeployHelper";
import { Queue } from "./throttler/queue";
import * as tasks from "./deploy/functions/tasks";
import { DeploymentTimer } from "./deploy/functions/deploymentTimer";
import { ErrorHandler } from "./deploy/functions/errorHandler";

export async function deleteFunctions(
  functionsNamesToDelete: string[],
  scheduledFunctionNamesToDelete: string[],
  projectId: string,
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

  const taskParams = {
    projectId,
    errorHandler,
  };
  functionsNamesToDelete.forEach((fnName) => {
    const deleteFunctionTask = tasks.deleteFunctionTask(taskParams, fnName);
    cloudFunctionsQueue.run(deleteFunctionTask);
  });
  scheduledFunctionNamesToDelete.forEach((fnName) => {
    const deleteSchedulerTask = tasks.deleteScheduleTask(taskParams, fnName, appEngineLocation);
    schedulerQueue.run(deleteSchedulerTask);
  });
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait()];

  cloudFunctionsQueue.close();
  schedulerQueue.close();
  cloudFunctionsQueue.process();
  schedulerQueue.process();

  await Promise.all(queuePromises);

  helper.logAndTrackDeployStats(cloudFunctionsQueue, errorHandler);
  errorHandler.printErrors();
}
