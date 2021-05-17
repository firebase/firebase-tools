/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import * as clc from "cli-color";

import * as utils from "../../utils";
import * as helper from "../../functionsDeployHelper";
import { createDeploymentPlan } from "./deploymentPlanner";
import * as tasks from "./tasks";
import { getAppEngineLocation } from "../../functionsConfig";
import { promptForFunctionDeletion } from "./prompts";
import Queue from "../../throttler/queue";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";
import * as args from "./args";
import * as deploymentPlanner from "./deploymentPlanner";

export async function release(context: args.Context, options: args.Options, payload: args.Payload) {
  if (!options.config.has("functions")) {
    return;
  }

  const projectId = context.projectId;
  const sourceUrl = context.uploadUrl!;
  const appEngineLocation = getAppEngineLocation(context.firebaseConfig);

  const timer = new DeploymentTimer();
  const errorHandler = new ErrorHandler();

  const fullDeployment = createDeploymentPlan(
    payload.functions!.byRegion,

    // Note: this is obviously a sketchy looking cast. And it's true; the shapes don't
    // line up. But it just so happens that we don't hit any bugs with the current
    // implementation of the function. This will all go away once everything uses
    // backend.FunctionSpec.
    (context.existingFunctions! as any) as deploymentPlanner.CloudFunctionTrigger[],
    context.filters
  );

  // This queue needs to retry quota errors.
  // The main quotas that can be exceeded are per 1 minute quotas,
  // so we start with a larger backoff to reduce the liklihood of extra retries.
  const cloudFunctionsQueue = new Queue<tasks.DeploymentTask, void>({
    retries: 30,
    backoff: 20000,
    concurrency: 40,
    maxBackoff: 40000,
    handler: tasks.functionsDeploymentHandler(timer, errorHandler),
  });
  const schedulerQueue = new Queue<tasks.DeploymentTask, void>({
    handler: tasks.schedulerDeploymentHandler(errorHandler),
  });
  const regionPromises = [];

  const taskParams: tasks.TaskParams = {
    projectId,
    sourceUrl,
    runtime: context.runtimeChoice,
    errorHandler,
  };

  const shouldDeleteFunctions = await promptForFunctionDeletion(
    fullDeployment.functionsToDelete,
    options.force,
    options.nonInteractive
  );
  if (shouldDeleteFunctions) {
    for (const fnName of fullDeployment.functionsToDelete) {
      const task = tasks.deleteFunctionTask(taskParams, fnName);
      cloudFunctionsQueue.run(task);
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
      tasks.runRegionalFunctionDeployment(taskParams, regionalDeployment, cloudFunctionsQueue)
    );

    // Add scheduler creates and updates to their queue.
    for (const fn of regionalDeployment.schedulesToUpsert) {
      const task = tasks.upsertScheduleTask(taskParams, fn, appEngineLocation);
      schedulerQueue.run(task);
    }
  }
  for (const fnName of fullDeployment.schedulesToDelete) {
    const task = tasks.deleteScheduleTask(taskParams, fnName, appEngineLocation);
    schedulerQueue.run(task);
  }

  // Once everything has been added to queues, starting processing.
  // Note: We need to set up these wait before calling process and close.
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait()];
  cloudFunctionsQueue.process();
  schedulerQueue.process();
  schedulerQueue.close();

  // Wait until the second round of creates/updates are added to the queue before closing it.
  await Promise.all(regionPromises);
  cloudFunctionsQueue.close();

  // Wait for the first function in each region to be deployed, and all the other calls to be queued,
  // then close the queue.
  // Wait for all of the deployments to complete.
  try {
    await Promise.all(queuePromises);
  } catch (err) {
    utils.reject(
      "Exceeded maximum retries while deploying functions. " +
        "If you are deploying a large number of functions, " +
        "please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. " +
        "Go to https://firebase.google.com/docs/cli/#partial_deploys to learn more.",
      {
        original: err,
      }
    );
  }
  helper.logAndTrackDeployStats(cloudFunctionsQueue, errorHandler);
  helper.printTriggerUrls(projectId, sourceUrl);
  errorHandler.printWarnings();
  errorHandler.printErrors();
}
