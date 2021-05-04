/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import Queue from "../../throttler/queue";
import { createDeploymentPlan } from "./deploymentPlanner";
import { getAppEngineLocation } from "../../functionsConfig";
import { promptForFunctionDeletion } from "./prompts";
import { DeploymentTimer } from "./deploymentTimer";
import { ErrorHandler } from "./errorHandler";
import * as utils from "../../utils";
import * as helper from "./functionsDeployHelper";
import * as tasks from "./tasks";
import * as backend from "./backend";
import * as args from "./args";

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
    payload.functions!.backend,
    await backend.existingBackend(context),
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
  const pubSubQueue = new Queue<tasks.DeploymentTask, void>({
    // We can actually use the same handler for Scheduler and Pub/Sub
    handler: tasks.schedulerDeploymentHandler(errorHandler),
  });
  const regionPromises = [];

  const taskParams: tasks.TaskParams = {
    projectId,
    sourceUrl,
    runtime: context.runtimeChoice,
    errorHandler,
  };

  // Note(inlined): We might increase consistency if we tried a fully regional strategy, but
  // the existing code was written to process deletes before creates and updates.
  const allFnsToDelete = Object.values(fullDeployment.regionalDeployments)
    .map((regionalChanges) => regionalChanges.functionsToDelete)
    .reduce((accum, functions) => [...(accum || []), ...functions]);
  const shouldDeleteFunctions = await promptForFunctionDeletion(
    allFnsToDelete,
    options.force,
    options.nonInteractive
  );
  if (shouldDeleteFunctions) {
    for (const fn of allFnsToDelete) {
      const task = tasks.deleteFunctionTask(taskParams, fn);
      cloudFunctionsQueue.run(task);
    }
  } else {
    // If we shouldn't delete functions, don't clean up their schedules either
    fullDeployment.schedulesToDelete = fullDeployment.schedulesToDelete.filter((schedule) => {
      return !allFnsToDelete.find(backend.sameFunctionName(schedule.targetService));
    });
    fullDeployment.topicsToDelete = fullDeployment.topicsToDelete.filter((topic) => {
      const fnName = backend.functionName(topic.targetService);
      return !allFnsToDelete.find(backend.sameFunctionName(topic.targetService));
    });
  }

  for (const [region, deployment] of Object.entries(fullDeployment.regionalDeployments)) {
    // Run the create and update function calls for the region.
    regionPromises.push(
      tasks.runRegionalFunctionDeployment(taskParams, region, deployment, cloudFunctionsQueue)
    );
  }

  for (const schedule of fullDeployment.schedulesToUpsert) {
    const task = tasks.upsertScheduleTask(taskParams, schedule, appEngineLocation);
    schedulerQueue.run(task);
  }
  for (const schedule of fullDeployment.schedulesToDelete) {
    const task = tasks.deleteScheduleTask(taskParams, schedule, appEngineLocation);
    schedulerQueue.run(task);
  }
  for (const topic of fullDeployment.topicsToDelete) {
    const task = tasks.deleteTopicTask(taskParams, topic);
    pubSubQueue.run(task);
  }

  // Once everything has been added to queues, starting processing.
  // Note: We need to set up these wait before calling process and close.
  const queuePromises = [cloudFunctionsQueue.wait(), schedulerQueue.wait(), pubSubQueue.wait()];
  cloudFunctionsQueue.process();
  schedulerQueue.process();
  pubSubQueue.process();
  schedulerQueue.close();
  pubSubQueue.close();

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
  await helper.printTriggerUrls(context);
  errorHandler.printWarnings();
  errorHandler.printErrors();
}
