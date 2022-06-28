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

import * as clc from "cli-color";
import * as functionsConfig from "../functionsConfig";

import { Command } from "../command";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { promptOnce } from "../prompt";
import { reduceFlat } from "../functional";
import { requirePermissions } from "../requirePermissions";
import * as args from "../deploy/functions/args";
import * as ensure from "../ensureApiEnabled";
import * as helper from "../deploy/functions/functionsDeployHelper";
import * as utils from "../utils";
import * as backend from "../deploy/functions/backend";
import * as planner from "../deploy/functions/release/planner";
import * as fabricator from "../deploy/functions/release/fabricator";
import * as executor from "../deploy/functions/release/executor";
import * as reporter from "../deploy/functions/release/reporter";
import * as containerCleaner from "../deploy/functions/containerCleaner";

export const command = new Command("functions:delete [filters...]")
  .description("delete one or more Cloud Functions by name or group name.")
  .option(
    "--region <region>",
    "Specify region of the function to be deleted. " +
      "If omitted, functions from all regions whose names match the filters will be deleted. "
  )
  .withForce()
  .before(requirePermissions, ["cloudfunctions.functions.list", "cloudfunctions.functions.delete"])
  .action(async (filters: string[], options: { force: boolean; region?: string } & Options) => {
    if (!filters.length) {
      return utils.reject("Must supply at least function or group name.");
    }

    const context: args.Context = {
      projectId: needProjectId(options),
      filters: filters.map((f) => ({ idChunks: f.split(".") })),
    };

    const [config, existingBackend] = await Promise.all([
      functionsConfig.getFirebaseConfig(options),
      backend.existingBackend(context),
    ]);
    await backend.checkAvailability(context, /* want=*/ backend.empty());
    const appEngineLocation = functionsConfig.getAppEngineLocation(config);

    if (options.region) {
      existingBackend.endpoints = { [options.region]: existingBackend.endpoints[options.region] };
    }
    const plan = planner.createDeploymentPlan({
      wantBackend: backend.empty(),
      haveBackend: existingBackend,
      codebase: "",
      filters: context.filters,
      deleteAll: true,
    });
    const allEpToDelete = Object.values(plan)
      .map((changes) => changes.endpointsToDelete)
      .reduce(reduceFlat, [])
      .sort(backend.compareFunctions);
    if (allEpToDelete.length === 0) {
      throw new FirebaseError(
        `The specified filters do not match any existing functions in project ${clc.bold(
          context.projectId
        )}.`
      );
    }

    const deleteList = allEpToDelete.map((func) => `\t${helper.getFunctionLabel(func)}`).join("\n");
    const confirmDeletion = await promptOnce(
      {
        type: "confirm",
        name: "force",
        default: false,
        message:
          "You are about to delete the following Cloud Functions:\n" +
          deleteList +
          "\n  Are you sure?",
      },
      options
    );
    if (!confirmDeletion) {
      throw new FirebaseError("Command aborted.");
    }

    const functionExecutor: executor.QueueExecutor = new executor.QueueExecutor({
      retries: 30,
      backoff: 20000,
      concurrency: 40,
      maxBackoff: 40000,
    });

    try {
      const fab = new fabricator.Fabricator({
        functionExecutor,
        appEngineLocation,
        executor: new executor.QueueExecutor({}),
        sources: {},
      });
      const summary = await fab.applyPlan(plan);
      await reporter.logAndTrackDeployStats(summary);
      reporter.printErrors(summary);
    } catch (err: any) {
      throw new FirebaseError("Failed to delete functions", {
        original: err as Error,
        exit: 1,
      });
    }

    // Clean up image caches too
    const opts: { ar?: containerCleaner.ArtifactRegistryCleaner } = {};
    const arEnabled = await ensure.check(
      needProjectId(options),
      "artifactregistry.googleapis.com",
      "functions",
      /* silent= */ true
    );
    if (!arEnabled) {
      opts.ar = new containerCleaner.NoopArtifactRegistryCleaner();
    }
    await containerCleaner.cleanupBuildImages([], allEpToDelete, opts);
  });
