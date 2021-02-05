import * as helper from "./functionsDeployHelper";
import { Queue } from "./throttler/queue";
import * as tasks from "./deploy/functions/tasks";
import { DeploymentTimer } from "./deploy/functions/deploymentTimer";
import { ErrorHandler } from "./deploy/functions/errorHandler";

export async function deleteFunctions(
  functionsNamesToDelete: string[],
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
    cloudFunctionsQueue
      .run(deleteFunctionTask)
      .then(() => {
        helper.printSuccess(fnName, "delete");
      })
      .catch((err) => {
        errorHandler.record("error", fnName, "delete", err.message || "");
      });

    const deleteSchedulerTask = tasks.deleteScheduleTask(fnName, appEngineLocation);
    schedulerQueue
      .run(deleteSchedulerTask)
      .then(() => {
        helper.printSuccess(fnName, "delete schedule");
      })
      .catch((err) => {
        // if err.status is 403, the project doesnt have the api enabled
        // and there are no schedules to delete, so catch the error.
        console.log(err);
        if (err.context?.response?.statusCode !== 403) {
          errorHandler.record("error", fnName, "delete schedule", err.message || "");
        }
      });
  });
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait()];

  cloudFunctionsQueue.close();
  schedulerQueue.close();
  cloudFunctionsQueue.process();
  schedulerQueue.process();

  await Promise.all(queuePromises);

  helper.logAndTrackDeployStats;
  errorHandler.printErrors();
}
