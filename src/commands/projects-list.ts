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
import * as ora from "ora";
import Table = require("cli-table");

import { Command } from "../command";
import { FirebaseProjectMetadata, listFirebaseProjects } from "../management/projects";
import { requireAuth } from "../requireAuth";
import { logger } from "../logger";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

function logProjectsList(projects: FirebaseProjectMetadata[], currentProjectId: string): void {
  if (!projects.length) {
    return;
  }

  const tableHead = [
    "Project Display Name",
    "Project ID",
    "Project Number",
    "Resource Location ID",
  ];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  projects.forEach(({ projectId, projectNumber, displayName, resources }) => {
    if (projectId === currentProjectId) {
      projectId = clc.cyan.bold(`${projectId} (current)`);
    }
    table.push([
      displayName || NOT_SPECIFIED,
      projectId,
      projectNumber,
      (resources && resources.locationId) || NOT_SPECIFIED,
    ]);
  });

  logger.info(table.toString());
}

function logProjectCount(arr: FirebaseProjectMetadata[] = []): void {
  if (!arr.length) {
    logger.info(clc.bold("No projects found."));
    return;
  }
  logger.info("");
  logger.info(`${arr.length} project(s) total.`);
}

export const command = new Command("projects:list")
  .description("list all Firebase projects you have access to")
  .before(requireAuth)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (options: any): Promise<FirebaseProjectMetadata[]> => {
      const spinner = ora("Preparing the list of your Firebase projects").start();
      let projects;

      try {
        projects = await listFirebaseProjects();
      } catch (err: any) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logProjectsList(projects, options.project);
      logProjectCount(projects);
      return projects;
    }
  );
