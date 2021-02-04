/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import * as clc from "cli-color";

import * as utils from "../../utils";
import * as helper from "../../functionsDeployHelper";
import { CloudFunctionTrigger, createDeploymentPlan } from "./deploymentPlanner";
import * as tasks from "./tasks";
import { getAppEngineLocation } from "../../functionsConfig";
import { promptForFunctionDeletion } from "./prompts";
import Queue from "../../throttler/queue";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";

export async function release(context: any, options: any, payload: any) {
  if (!options.config.has("functions")) {
    return;
  }

  const projectId = context.projectId;
  const sourceUrl = context.uploadUrl;
  const appEngineLocation = getAppEngineLocation(context.firebaseConfig);

  const timer = new DeploymentTimer();
  const errorHandler = new ErrorHandler();

  const fullDeployment = createDeploymentPlan(
    payload.functions.byRegion,
    context.existingFunctions,
    context.filters
  );
  const cloudFunctionsQueue = new Queue<() => Promise<CloudFunctionTrigger|void>, void>({});
  const schedulerQueue = new Queue<() => Promise<any>, void>({});
  const regionPromises = [];

  const retryFuncParams: tasks.RetryFunctionParams = {
    projectId,
    sourceUrl,
    runtime: context.runtimeChoice,
    timer,
    errorHandler,
  };

  const shouldDeleteFunctions = await promptForFunctionDeletion(
    fullDeployment.functionsToDelete,
    options.force,
    options.nonInteractive
  );
  if (shouldDeleteFunctions) {
    for (const fnName of fullDeployment.functionsToDelete) {
      cloudFunctionsQueue
        .run(tasks.deleteFunctionTask(retryFuncParams, fnName))
        .then(() => {
          helper.printSuccess(fnName, "delete");
        })
        .catch((err) => {
          errorHandler.record("error", fnName, "delete", err.message || "");
        });
    }
  } else {
    // If we shouldn't delete functions, don't clean up their schedules either
    fullDeployment.schedulesToDelete = fullDeployment.schedulesToDelete.filter((fnName) => {
      // Only delete the schedules for functions that are no longer scheduled.
      return !fullDeployment.functionsToDelete.includes(fnName);
    });
    if (fullDeployment.functionsToDelete.length !== 0) {
      utils.logBullet(clc.bold.cyan("functions: ") + "continuing with other deployments.");
    }
  }

  for (const regionalDeployment of fullDeployment.regionalDeployments) {
    // Run the create and update function calls for the region.
    regionPromises.push(
      tasks.runRegionalFunctionDeployment(retryFuncParams, regionalDeployment, cloudFunctionsQueue)
    );

    // Add scheduler creates and updates to their queue.
    for (const fn of regionalDeployment.schedulesToUpsert) {
      const task = tasks.upsertScheduleTask(retryFuncParams, fn, appEngineLocation);
      schedulerQueue
        .run(task)
        .then(() => {
          helper.printSuccess(fn.name, "upsert schedule");
        })
        .catch((err) => {
          errorHandler.record("error", fn.name, "upsert schedule", err.message || "");
        });
    }
  }
  for (const fnName of fullDeployment.schedulesToDelete) {
    schedulerQueue
      .run(tasks.deleteScheduleTask(fnName, appEngineLocation))
      .then(() => {
        helper.printSuccess(fnName, "delete schedule");
      })
      .catch((err) => {
        errorHandler.record("error", fnName, "delete schedule", err.message || "");
      });
  }

  // Once everything has been added to queues, starting processing.
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait()]; 
  cloudFunctionsQueue.process();
  schedulerQueue.process();
  schedulerQueue.close();

  // Wait until the second round of creates/updates are added to the queue before closing it.
  await Promise.all(regionPromises)
  cloudFunctionsQueue.close();

  // Wait for the first function in each region to be deployed, and all the other calls to be queued,
  // then close the queue.
  // Wait for all of the deployments to complete.
  await Promise.all(queuePromises);
  // TODO: We should also await the scheduler queue. However, for reasons I don't understand,
  // awaiting 2 queues makes it so none of the code below this executes.
  // If I remove either queue, it works correctly.
  // Not sure if this is a bug with queue or if I'm doing something subtly incorrect, but functions deploys are ~2 orders of magnitude longer
  // than schedule deployments, and there are no deployments that contain only calls to scheduler, so this works for now.
  // await schedulerQueue.wait();
  helper.logAndTrackDeployStats(cloudFunctionsQueue);
  errorHandler.printWarnings();
  errorHandler.printErrors();
  return helper.printTriggerUrls(projectId, sourceUrl);
}
