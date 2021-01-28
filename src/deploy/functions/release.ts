/**
 * If you make any changes to this file, run the integration test in scripts/test-functions-deploy.js
 */
import * as clc from "cli-color";
import * as _ from "lodash";

import { cloudfunctions, cloudscheduler, pubsub } from "../../gcp";
import * as logger from "../../logger";
import * as deploymentTool from "../../deploymentTool";
import * as track from "../../track";
import * as utils from "../../utils";
import * as helper from "../../functionsDeployHelper";
import { CloudFunctionTrigger, createDeploymentPlan } from "./deploymentPlanner";
import * as retryFunctions from "./retryFunctions";
import { FirebaseError } from "../../error";
import { getHumanFriendlyRuntimeName } from "../../parseRuntimeAndValidateSDK";
import { getAppEngineLocation } from "../../functionsConfig";
import { promptOnce } from "../../prompt";
import { createOrUpdateSchedulesAndTopics } from "./createOrUpdateSchedulesAndTopics";
import Queue from "../../throttler/queue";
import { region } from "firebase-functions";

interface Timing {
  type?: string;
  t0?: [number, number]; // [seconds, nanos]
}

interface Deployment {
  name: string;
  retryFunction: () => any;
  trigger?: any; // TODO: type this
}

let timings: { [name: string]: Timing } = {};
let deployments: Deployment[] = [];
let failedDeployments: string[] = [];

const DEFAULT_PUBLIC_POLICY = {
  version: 3,
  bindings: [
    {
      role: "roles/cloudfunctions.invoker",
      members: ["allUsers"],
    },
  ],
};

function startTimer(name: string, type: string) {
  timings[name] = { type: type, t0: process.hrtime() };
}

function endTimer(name: string) {
  if (!timings[name]) {
    logger.debug("[functions] no timer initialized for", name);
    return;
  }

  // hrtime returns a duration as an array of [seconds, nanos]
  const duration = process.hrtime(timings[name].t0);
  track(
    "Functions Deploy (Duration)",
    timings[name].type,
    duration[0] * 1000 + Math.round(duration[1] * 1e-6)
  );
}

async function fetchTriggerUrls(projectId: string, ops: helper.Operation[], sourceUrl: string) {
  if (!_.find(ops, ["trigger.httpsTrigger", {}])) {
    // No HTTPS functions being deployed
    return;
  }

  const functions = await cloudfunctions.listAllFunctions(projectId);
  const httpFunctions = _.chain(functions)
    .filter({ sourceUploadUrl: sourceUrl })
    .filter("httpsTrigger")
    .value();
  _.forEach(httpFunctions, (httpFunc) => {
    const op = _.find(ops, { funcName: httpFunc.name });
    if (op) {
      op.triggerUrl = httpFunc.httpsTrigger.url;
    }
  });
  return;
}

function printSuccess(op: helper.Operation) {
  endTimer(op.funcName);
  utils.logSuccess(
    clc.bold.green("functions[" + helper.getFunctionLabel(op.funcName) + "]: ") +
      "Successful " +
      op.type +
      " operation. "
  );
  if (op.triggerUrl && op.type !== "delete") {
    logger.info(
      clc.bold("Function URL"),
      "(" + helper.getFunctionName(op.funcName) + "):",
      op.triggerUrl
    );
  }
}

function printFail(op: helper.Operation) {
  endTimer(op.funcName);
  failedDeployments.push(helper.getFunctionName(op.funcName));
  utils.logWarning(
    clc.bold.yellow("functions[" + helper.getFunctionLabel(op.funcName) + "]: ") +
      "Deployment error."
  );
  if (op.error?.code === 8) {
    logger.debug(op.error.message);
    logger.info(
      "You have exceeded your deployment quota, please deploy your functions in batches by using the --only flag, " +
        "and wait a few minutes before deploying again. Go to " +
        clc.underline("https://firebase.google.com/docs/cli/#deploy_specific_functions") +
        " to learn more."
    );
  } else {
    logger.info(op.error?.message);
  }
}

function printTooManyOps(projectId: string) {
  utils.logWarning(
    clc.bold.yellow("functions:") + " too many functions are being deployed, cannot poll status."
  );
  logger.info(
    "In a few minutes, you can check status at " + utils.consoleUrl(projectId, "/functions/logs")
  );
  logger.info(
    "You can use the --only flag to deploy only a portion of your functions in the future."
  );
  deployments = []; // prevents analytics tracking of deployments
}

export async function release(context: any, options: any, payload: any) {
  if (!options.config.has("functions")) {
    return;
  }

  const projectId = context.projectId;
  const sourceUrl = context.uploadUrl;
  const appEngineLocation = getAppEngineLocation(context.firebaseConfig);

  // Reset module-level variables to prevent duplicate deploys when using firebase-tools as an import.
  timings = {};
  deployments = [];
  failedDeployments = [];

  const fullDeployment = createDeploymentPlan(
    payload.functions.regionMap,
    context.existingFunctions,
    context.filters
  );
  const cloudFunctionsQueue = new Queue<() => any, any>({})
  const schedulerQueue = new Queue<() => any, any>({})
  const regionPromises = []

  for (const regionalDeployment of fullDeployment.regionalDeployments) {
    const retryFuncParams: retryFunctions.RetryFunctionParams = {
      projectId,
      sourceUrl,
      region: regionalDeployment.region,
      runtime: context.runtimeChoice,
    }
    // Build an onPoll function to check for sourceToken and queue up the rest of the deployment.
    const onPollFn = (op: any) => {
      // We should run the rest of the regional deployment if we either:
      // - Have a sourceToken to use.
      // - Never got a sourceToken back from the operation. In this case, finish the deployment without using sourceToken.
      const shouldFinishDeployment = (op.metadata?.sourceToken && !regionalDeployment.sourceToken) || (!op.metadata?.sourceToken && op.done);
      if (shouldFinishDeployment) {
        regionalDeployment.sourceToken = op.metadata.sourceToken;
        retryFunctions.runRegionalDeployment(retryFuncParams, regionalDeployment, cloudFunctionsQueue)
      }
    }; 

    // Choose a first function to deploy.
    if (regionalDeployment.functionsToCreate.length) {
      const firstFn = regionalDeployment.functionsToCreate.shift();
      regionalDeployment.firstFunctionDeployment = retryFunctions.retryFunctionForCreate(retryFuncParams, firstFn!, onPollFn);
    } else if (regionalDeployment.functionsToUpdate.length) {
      const firstFn = regionalDeployment.functionsToUpdate.shift();
      regionalDeployment.firstFunctionDeployment = retryFunctions.retryFunctionForUpdate(retryFuncParams, firstFn!, onPollFn);
    } 
  
    if (regionalDeployment.firstFunctionDeployment) {
      // Kick off the first deployment, and keep track of when it finishes.
      regionPromises.push(cloudFunctionsQueue.run(regionalDeployment.firstFunctionDeployment));
    }

    // Add scheduler creates and updates to their queue.
    for (const fn of regionalDeployment.schedulesToCreateOrUpdate) {
      const retryFunction = retryFunctions.retryFunctionForScheduleCreateOrUpdate(retryFuncParams, fn, appEngineLocation);
      schedulerQueue.run(retryFunction)
      .then(() => {
        console.log(`Successfully crupdated schedule for ${fn.name}`);
      }).catch((err) => {
        console.log(`Error while crupdating schedule for ${fn.name}: ${err}`);
      });;
    }
  }
  for (const fnName of fullDeployment.functionsToDelete) {
    cloudFunctionsQueue.run(retryFunctions.retryFunctionForDelete(fnName)).then(() => {
      console.log(`Successfully deleted ${fnName}`);
    }).catch((err) => {
      console.log(`Error while deleting ${fnName}: ${err}`);
    });;;
  }
  cloudFunctionsQueue.process();

  for (const fnName of fullDeployment.schedulesToDelete) {
    schedulerQueue.run(retryFunctions.retryFunctionForScheduleDelete(fnName, appEngineLocation))
    .then(() => {
      console.log(`Successfully deleted schedule for ${fnName}`);
    }).catch((err) => {
      console.log(`Error while delete schedule for ${fnName}: ${err}`);
    });;;
  }
  schedulerQueue.close();
  schedulerQueue.process();

  // Wait for the first function in each region to be deployed, then close the queue.
  await Promise.all(regionPromises);
  cloudFunctionsQueue.close();

  // Wait for all of the deployments to complete.
  await cloudFunctionsQueue.wait();
  await schedulerQueue.wait();
  console.log("hey we dunzo");
  // delete payload.functions;

  // // Create functions
  // _.chain(uploadedNames)
  //   .difference(existingNames)
  //   .intersection(releaseNames)
  //   .forEach((name) => {
  //     const functionInfo = _.find(functionsInfo, { name: name })!;
  //     const functionTrigger = helper.getFunctionTrigger(functionInfo);
  //     const functionName = helper.getFunctionName(name);
  //     const region = helper.getRegion(name);
  //     utils.logBullet(
  //       clc.bold.cyan("functions: ") +
  //         "creating " +
  //         getHumanFriendlyRuntimeName(runtime) +
  //         " function " +
  //         clc.bold(helper.getFunctionLabel(name)) +
  //         "..."
  //     );
  //     logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
  //     const eventType = functionTrigger.eventTrigger
  //       ? functionTrigger.eventTrigger.eventType
  //       : "https";
  //     startTimer(name, "create");
  //     const retryFunction = async () => {
  //       const createRes = await cloudfunctions.createFunction({
  //         projectId: projectId,
  //         region: region,
  //         eventType: eventType,
  //         functionName: functionName,
  //         entryPoint: functionInfo.entryPoint,
  //         trigger: functionTrigger,
  //         labels: _.assign({}, deploymentTool.labels(), functionInfo.labels),
  //         sourceUploadUrl: sourceUrl,
  //         runtime: runtime,
  //         availableMemoryMb: functionInfo.availableMemoryMb,
  //         timeout: functionInfo.timeout,
  //         maxInstances: functionInfo.maxInstances,
  //         environmentVariables: defaultEnvVariables,
  //         vpcConnector: functionInfo.vpcConnector,
  //         vpcConnectorEgressSettings: functionInfo.vpcConnectorEgressSettings,
  //         serviceAccountEmail: functionInfo.serviceAccountEmail,
  //       });
  //       if (_.has(functionTrigger, "httpsTrigger")) {
  //         logger.debug(`Setting public policy for function ${functionName}`);
  //         await cloudfunctions.setIamPolicy({
  //           functionName,
  //           projectId,
  //           region,
  //           policy: DEFAULT_PUBLIC_POLICY,
  //         });
  //       }
  //       return createRes;
  //     };

  //     deployments.push({
  //       name,
  //       retryFunction,
  //       trigger: functionTrigger,
  //     });
  //   })
  //   .value();

  // // Update functions
  // _.chain(uploadedNames)
  //   .intersection(existingNames)
  //   .intersection(releaseNames)
  //   .forEach((name) => {
  //     const functionInfo = _.find(functionsInfo, { name: name })!;
  //     const functionTrigger = helper.getFunctionTrigger(functionInfo);
  //     const functionName = helper.getFunctionName(name);
  //     const region = helper.getRegion(name);
  //     const existingFunction = _.find(existingFunctions, {
  //       name: name,
  //     });

  //     utils.logBullet(
  //       clc.bold.cyan("functions: ") +
  //         "updating " +
  //         getHumanFriendlyRuntimeName(runtime) +
  //         " function " +
  //         clc.bold(helper.getFunctionLabel(name)) +
  //         "..."
  //     );
  //     logger.debug("Trigger is: ", JSON.stringify(functionTrigger));
  //     startTimer(name, "update");
  //     const options = {
  //       projectId: projectId,
  //       region: region,
  //       functionName: functionName,
  //       trigger: functionTrigger,
  //       sourceUploadUrl: sourceUrl,
  //       labels: _.assign({}, deploymentTool.labels(), functionInfo.labels),
  //       availableMemoryMb: functionInfo.availableMemoryMb,
  //       timeout: functionInfo.timeout,
  //       runtime: runtime,
  //       maxInstances: functionInfo.maxInstances,
  //       vpcConnector: functionInfo.vpcConnector,
  //       vpcConnectorEgressSettings: functionInfo.vpcConnectorEgressSettings,
  //       serviceAccountEmail: functionInfo.serviceAccountEmail,
  //       environmentVariables: _.assign(
  //         {},
  //         existingFunction.environmentVariables,
  //         defaultEnvVariables
  //       ),
  //     };
  //     deployments.push({
  //       name: name,
  //       retryFunction: async function () {
  //         return cloudfunctions.updateFunction(options);
  //       },
  //       trigger: functionTrigger,
  //     });
  //   })
  //   .value();

  // // Delete functions
  // const functionsToDelete = _.chain(existingFunctions)
  //   .filter((functionInfo) => {
  //     return deploymentTool.check(functionInfo.labels);
  //   }) // only delete functions uploaded via firebase-tools
  //   .map((fn) => {
  //     return _.get(fn, "name");
  //   })
  //   .difference(uploadedNames)
  //   .intersection(deleteReleaseNames)
  //   .value();

  // if (functionsToDelete.length) {
  //   const deleteList = _.map(functionsToDelete, (func) => {
  //     return "\t" + helper.getFunctionLabel(func);
  //   }).join("\n");

  //   if (options.nonInteractive && !options.force) {
  //     const deleteCommands = _.map(functionsToDelete, (func) => {
  //       return (
  //         "\tfirebase functions:delete " +
  //         helper.getFunctionName(func) +
  //         " --region " +
  //         helper.getRegion(func)
  //       );
  //     }).join("\n");

  //     throw new FirebaseError(
  //       "The following functions are found in your project but do not exist in your local source code:\n" +
  //         deleteList +
  //         "\n\nAborting because deletion cannot proceed in non-interactive mode. To fix, manually delete the functions by running:\n" +
  //         clc.bold(deleteCommands)
  //     );
  //   } else if (!options.force) {
  //     logger.info(
  //       "\nThe following functions are found in your project but do not exist in your local source code:\n" +
  //         deleteList +
  //         "\n\nIf you are renaming a function or changing its region, it is recommended that you create the new " +
  //         "function first before deleting the old one to prevent event loss. For more info, visit " +
  //         clc.underline("https://firebase.google.com/docs/functions/manage-functions#modify" + "\n")
  //     );
  //   }

  //   let proceed = true;
  //   if (!options.force) {
  //     proceed = await promptOnce({
  //       type: "confirm",
  //       name: "confirm",
  //       default: false,
  //       message:
  //         "Would you like to proceed with deletion? Selecting no will continue the rest of the deployments.",
  //     });
  //   }
  //   if (proceed) {
  //     functionsToDelete.forEach((name) => {
  //       const functionName = helper.getFunctionName(name);
  //       const scheduleName = helper.getScheduleName(name, appEngineLocation);
  //       const topicName = helper.getTopicName(name);
  //       const region = helper.getRegion(name);

  //       utils.logBullet(
  //         clc.bold.cyan("functions: ") +
  //           "deleting function " +
  //           clc.bold(helper.getFunctionLabel(name)) +
  //           "..."
  //       );
  //       startTimer(name, "delete");
  //       let retryFunction;
  //       const isScheduledFunction = _.includes(existingScheduledFunctions, name);
  //       if (isScheduledFunction) {
  //         retryFunction = async function () {
  //           try {
  //             await cloudscheduler.deleteJob(scheduleName);
  //           } catch (err) {
  //             // if err.status is 404, the schedule doesnt exist, so catch the error
  //             // if err.status is 403, the project doesnt have the api enabled and there are no schedules to delete, so catch the error
  //             logger.debug(err);
  //             if (
  //               err.context.response.statusCode != 404 &&
  //               err.context.response.statusCode != 403
  //             ) {
  //               throw new FirebaseError(
  //                 `Failed to delete schedule for ${functionName} with status ${err.status}`,
  //                 err
  //               );
  //             }
  //           }
  //           try {
  //             await pubsub.deleteTopic(topicName);
  //           } catch (err) {
  //             // if err.status is 404, the topic doesnt exist, so catch the error
  //             // if err.status is 403, the project doesnt have the api enabled and there are no topics to delete, so catch the error
  //             if (
  //               err.context.response.statusCode != 404 &&
  //               err.context.response.statusCode != 403
  //             ) {
  //               throw new FirebaseError(
  //                 `Failed to delete topic for ${functionName} with status ${err.status}`,
  //                 err
  //               );
  //             }
  //           }
  //           return cloudfunctions.deleteFunction({
  //             projectId: projectId,
  //             region: region,
  //             functionName: functionName,
  //           });
  //         };
  //       } else {
  //         retryFunction = async function () {
  //           return cloudfunctions.deleteFunction({
  //             projectId: projectId,
  //             region: region,
  //             functionName: functionName,
  //           });
  //         };
  //       }
  //       deployments.push({
  //         name: name,
  //         retryFunction: retryFunction,
  //       });
  //     });
  //   } else {
  //     if (deployments.length !== 0) {
  //       utils.logBullet(clc.bold.cyan("functions: ") + "continuing with other deployments.");
  //     }
  //   }
  // }
  // // filter out functions that are excluded via --only and --except flags
  // const functionsInDeploy = functionsInfo.filter((trigger: helper.CloudFunctionTrigger) => {
  //   return functionFilterGroups.length > 0 ? _.includes(deleteReleaseNames, trigger.name) : true;
  // });
  // await createOrUpdateSchedulesAndTopics(
  //   context.projectId,
  //   functionsInDeploy,
  //   existingScheduledFunctions,
  //   appEngineLocation
  // );
  // const allOps = await utils.promiseAllSettled(
  //   _.map(deployments, async (op) => {
  //     const res = await op.retryFunction();
  //     return _.merge(op, res);
  //   })
  // );
  // const failedCalls = _.chain(allOps).filter({ state: "rejected" }).map("reason").value();
  // const successfulCalls = _.chain(allOps).filter({ state: "fulfilled" }).map("value").value();
  // failedDeployments = failedCalls.map((error) => _.get(error, "context.function", ""));

  // await fetchTriggerUrls(projectId, successfulCalls, sourceUrl);

  // await helper.pollDeploys(successfulCalls, printSuccess, printFail, printTooManyOps, projectId);
  // if (deployments.length > 0) {
  //   track("Functions Deploy (Result)", "failure", failedDeployments.length);
  //   track("Functions Deploy (Result)", "success", deployments.length - failedDeployments.length);
  // }

  // if (failedDeployments.length > 0) {
  //   logger.info("\n\nFunctions deploy had errors with the following functions:");
  //   const sortedFailedDeployments = failedDeployments.sort();
  //   for (const failedDep of sortedFailedDeployments) {
  //     logger.info(`\t${failedDep}`);
  //   }
  //   logger.info("\n\nTo try redeploying those functions, run:");
  //   logger.info(
  //     "    " +
  //       clc.bold("firebase deploy --only ") +
  //       clc.bold('"') +
  //       clc.bold(
  //         sortedFailedDeployments.map((name) => `functions:${name.replace(/-/g, ".")}`).join(",")
  //       ) +
  //       clc.bold('"')
  //   );
  //   logger.info("\n\nTo continue deploying other features (such as database), run:");
  //   logger.info("    " + clc.bold("firebase deploy --except functions"));
  //   throw new FirebaseError("Functions did not deploy properly.");
  // }
}
