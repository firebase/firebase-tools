import * as tasks from "./tasks.js";
import Queue from "../../throttler/queue.js";
import { Context, Payload } from "./args.js";
import { FirebaseError } from "../../error.js";
import { ErrorHandler } from "./errors.js";
import { Options } from "../../options.js";
import { needProjectId } from "../../projectUtils.js";
import { bulkCheckProductsProvisioned } from "../../extensions/provisioningHelper.js";
import { handleSecretParams } from "./secrets.js";
import { checkBilling } from "./validate.js";

export async function deploy(context: Context, options: Options, payload: Payload) {
  const projectId = needProjectId(options);
  // First, check that billing is enabled
  await checkBilling(projectId, options.nonInteractive);

  // Then, check that required products are provisioned.
  await bulkCheckProductsProvisioned(projectId, [
    ...(payload.instancesToCreate ?? []),
    ...(payload.instancesToUpdate ?? []),
    ...(payload.instancesToConfigure ?? []),
  ]);

  // Then, check if the secrets used exist, and prompt to create them if not.
  await handleSecretParams(payload, context.have!, options.nonInteractive);

  // Then, run validateOnly calls.
  const errorHandler = new ErrorHandler();
  const validationQueue = new Queue<tasks.ExtensionDeploymentTask, void>({
    retries: 5,
    concurrency: 5,
    handler: tasks.extensionsDeploymentHandler(errorHandler),
  });

  // Validate all creates, updates and configures.
  // Skip validating local extensions, since doing so requires us to create a new source.
  // No need to validate deletes.
  for (const create of payload.instancesToCreate?.filter((i) => !!i.ref) ?? []) {
    const task = tasks.createExtensionInstanceTask(projectId, create, /* validateOnly=*/ true);
    void validationQueue.run(task);
  }

  for (const update of payload.instancesToUpdate?.filter((i) => !!i.ref) ?? []) {
    const task = tasks.updateExtensionInstanceTask(projectId, update, /* validateOnly=*/ true);
    void validationQueue.run(task);
  }

  for (const configure of payload.instancesToConfigure?.filter((i) => !!i.ref) ?? []) {
    const task = tasks.configureExtensionInstanceTask(
      projectId,
      configure,
      /* validateOnly=*/ true
    );
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
      `Extensions deployment failed validation. No changes have been made to the Extension instances on ${projectId}`
    );
  }
}
