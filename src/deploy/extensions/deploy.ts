/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as tasks from "./tasks";
import Queue from "../../throttler/queue";
import { Context, Payload } from "./args";
import { FirebaseError } from "../../error";
import { ErrorHandler } from "./errors";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { bulkCheckProductsProvisioned } from "../../extensions/provisioningHelper";
import { handleSecretParams } from "./secrets";
import { checkBilling } from "./validate";

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
