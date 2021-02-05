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
  const cloudFunctionsQueue = new Queue<() => Promise<void>, void>({});
  const schedulerQueue = new Queue<() => Promise<void>, void>({});
  const timer = new DeploymentTimer();
  const errorHandler = new ErrorHandler();
  const taskParams = {
    projectId,
    timer,
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

  helper.logAndTrackDeployStats(cloudFunctionsQueue);
  errorHandler.printErrors();
}
