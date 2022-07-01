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
