import Queue from "../../throttler/queue";
import * as tasks from "./tasks";
import * as planner from "./planner";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";
import { ErrorHandler } from "./errors";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { saveEtags } from "../../extensions/etags";
import { trackGA4 } from "../../track";

export async function release(context: Context, options: Options, payload: Payload) {
  if (
    !payload.instancesToCreate &&
    !payload.instancesToUpdate &&
    !payload.instancesToConfigure &&
    !payload.instancesToDelete
  ) {
    return;
  }
  const projectId = needProjectId(options);

  const errorHandler = new ErrorHandler();
  const deploymentQueue = new Queue<tasks.ExtensionDeploymentTask, void>({
    retries: 5,
    concurrency: 5,
    handler: tasks.extensionsDeploymentHandler(errorHandler),
  });

  for (const inst of payload.instancesToConfigure ?? []) {
    const task = tasks.configureExtensionInstanceTask(projectId, inst);
    void deploymentQueue.run(task);
  }

  for (const inst of payload.instancesToDelete ?? []) {
    const task = tasks.deleteExtensionInstanceTask(projectId, inst);
    void deploymentQueue.run(task);
  }

  for (const inst of payload.instancesToCreate ?? []) {
    const task = tasks.createExtensionInstanceTask(projectId, inst);
    void deploymentQueue.run(task);
  }

  for (const inst of payload.instancesToUpdate ?? []) {
    const task = tasks.updateExtensionInstanceTask(projectId, inst);
    void deploymentQueue.run(task);
  }

  // Note: We need to wait() _BEFORE_ calling process() and close().
  const deploymentPromise = deploymentQueue.wait();

  deploymentQueue.process();
  deploymentQueue.close();

  await deploymentPromise;
  // extensionsStartTime should always be populated, but if not, fall back to something that won't break us.
  const duration = context.extensionsStartTime ? Date.now() - context.extensionsStartTime : 1;
  await trackGA4(
    "extensions_deploy",
    {
      extension_instance_created: payload.instancesToCreate?.length ?? 0,
      extension_instance_updated: payload.instancesToUpdate?.length ?? 0,
      extension_instance_configured: payload.instancesToConfigure?.length ?? 0,
      extension_instance_deleted: payload.instancesToDelete?.length ?? 0,
      errors: errorHandler.errors.length ?? 0,
      interactive: options.nonInteractive ? "false" : "true",
    },
    duration,
  );

  // After deployment, write the latest etags to RC so we can detect out of
  // band changes in the next deploy.
  const have = await planner.have(projectId);
  const dynamicHave = await planner.haveDynamic(projectId);

  saveEtags(options.rc, projectId, have.concat(dynamicHave));

  if (errorHandler.hasErrors()) {
    errorHandler.print();
    throw new FirebaseError(`Extensions deployment failed.`);
  }
}
