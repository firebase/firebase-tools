/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import * as clc from "cli-color";

import * as utils from "../../utils";
import * as helper from "../../functionsDeployHelper";
import {  createDeploymentPlan } from "./deploymentPlanner";
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
  const cloudFunctionsQueue = new Queue<() => any, any>({});
  const schedulerQueue = new Queue<() => any, any>({});
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
          helper.printSuccess(fnName, 'delete');
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
    regionPromises.push(tasks.runRegionalDeployment(retryFuncParams, regionalDeployment, cloudFunctionsQueue));

    // Add scheduler creates and updates to their queue.
    for (const fn of regionalDeployment.schedulesToUpsert) {
      const task = tasks.upsertScheduleTask(
        retryFuncParams,
        fn,
        appEngineLocation
      );
      schedulerQueue
        .run(task)
        .then(() => {
          helper.printSuccess(fn.name, 'upsert schedule');
        })
        .catch((err) => {
          errorHandler.record("error", fn.name, "upsert schedule", err.message || "");
        });
    }
  }

  cloudFunctionsQueue.process();

  for (const fnName of fullDeployment.schedulesToDelete) {
    schedulerQueue
      .run(tasks.deleteScheduleTask(fnName, appEngineLocation))
      .then(() => {
        helper.printSuccess(fnName, 'delete schedule');
      })
      .catch((err) => {
        errorHandler.record("error", fnName, "delete schedule", err.message || "");
      });
  }
  schedulerQueue.close();
  schedulerQueue.process();

  // Wait for the first function in each region to be deployed, and all the other calls to be queued,
  // then close the queue.
  await Promise.all(regionPromises);
  cloudFunctionsQueue.close();

  // Wait for all of the deployments to complete.
  await cloudFunctionsQueue.wait();
  await schedulerQueue.wait();
  helper.logAndTrackDeployStats(cloudFunctionsQueue);
  await helper.printTriggerUrls(projectId, sourceUrl);
  errorHandler.printWarnings();
  errorHandler.printErrors();
  return;
}
