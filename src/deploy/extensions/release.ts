import Queue from "../../throttler/queue";
import * as tasks from "./tasks";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";
import { ErrorHandler } from "./errors";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";

export async function release(context: Context, options: Options, payload: Payload) {
  const projectId = needProjectId(options);

  const errorHandler = new ErrorHandler();
  const deploymentQueue = new Queue<tasks.ExtensionDeploymentTask, void>({
    retries: 5,
    concurrency: 5,
    handler: tasks.extensionsDeploymentHandler(errorHandler),
  });

  for (const creation of payload.instancesToCreate ?? []) {
    const task = tasks.createExtensionInstanceTask(projectId, creation);
    void deploymentQueue.run(task);
  }

  for (const update of payload.instancesToUpdate ?? []) {
    const task = tasks.updateExtensionInstanceTask(projectId, update);
    void deploymentQueue.run(task);
  }

  for (const update of payload.instancesToConfigure ?? []) {
    const task = tasks.configureExtensionInstanceTask(projectId, update);
    void deploymentQueue.run(task);
  }

  for (const deletion of payload.instancesToDelete ?? []) {
    const task = tasks.deleteExtensionInstanceTask(projectId, deletion);
    void deploymentQueue.run(task);
  }

  // Note: We need to wait() _BEFORE_ calling process() and close().
  const deploymentPromise = deploymentQueue.wait();

  deploymentQueue.process();
  deploymentQueue.close();

  await deploymentPromise;

  if (errorHandler.hasErrors()) {
    errorHandler.print();
    throw new FirebaseError(`Extensions deployment failed.`);
  }
}
