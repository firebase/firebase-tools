import { Options } from "../../options";
import { Payload } from "./args";
import Queue from "../../throttler/queue";
import * as tasks from "./tasks";
import { ErrorHandler } from "./errors";
import { needProjectId } from "../../projectUtils";
import { FirebaseError } from "../../error";

export async function deploy(
  context: any, // TODO: type this
  options: Options,
  payload: Payload
) {
  const projectId = needProjectId(options);

  const errorHandler = new ErrorHandler();
  const validationQueue = new Queue<tasks.ExtensionDeploymentTask, void>({
    retries: 5,
    concurrency: 5,
    handler: tasks.extensionsDeploymentHandler(errorHandler),
  });

  // Validate all creates an updates.
  // No need to validate deletes.
  for (const create of payload.instancesToCreate ?? []) {
    const task = tasks.createExtensionInstanceTask(projectId, create, /* validateOnly=*/ true);
    void validationQueue.run(task);
  }

  for (const update of payload.instancesToUpdate ?? []) {
    const task = tasks.updateExtensionInstanceTask(projectId, update, /* validateOnly=*/ true);
    void validationQueue.run(task);
  }

  // Note: We need to wait() _BEFORE_ calling process() and close().
  const validationPromise = validationQueue.wait();

  validationQueue.process();
  validationQueue.close();

  await validationPromise;

  if (errorHandler.hasErrors()) {
    errorHandler.print();
    throw new FirebaseError(
      `Extensions deployment failed validation. No changes have been made to ${projectId}`
    );
  }
}
