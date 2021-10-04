import { Options } from "../../options";
import { Payload } from "./args";
import Queue from "../../throttler/queue";
import * as tasks from "./tasks";
import { ErrorHandler } from "./errors";
import { needProjectId } from "../../projectUtils";
import { FirebaseError } from "../../error";

export async function release(
  context: any, // TODO: type this
  options: Options,
  payload: Payload
) {
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
