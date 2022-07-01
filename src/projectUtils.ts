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

import { getFirebaseProject } from "./management/projects";
import { RC } from "./rc";

import * as clc from "cli-color";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");

const { FirebaseError } = require("./error");

/**
 * Retrieves the projectId from a command's options context.
 *
 * @param options The options context for a command.
 * @returns The projectId
 */
export function getProjectId({
  projectId,
  project,
}: {
  projectId?: string;
  project?: string;
}): string | undefined {
  return projectId || project;
}

/**
 * Tries to determine the correct projectId given current
 * command context. Errors out if unable to determine.
 * @returns The projectId
 */
export function needProjectId({
  projectId,
  project,
  rc,
}: {
  projectId?: string;
  project?: string;
  rc?: RC;
}): string {
  if (projectId || project) {
    return projectId || project!;
  }

  const aliases = rc?.projects || {};
  const aliasCount = Object.keys(aliases).length;

  if (aliasCount === 0) {
    throw new FirebaseError(
      "No currently active project.\n" +
        "To run this command, you need to specify a project. You have two options:\n" +
        "- Run this command with " +
        clc.bold("--project <alias_or_project_id>") +
        ".\n" +
        "- Set an active project by running " +
        clc.bold("firebase use --add") +
        ", then rerun this command.\n" +
        "To list all the Firebase projects to which you have access, run " +
        clc.bold("firebase projects:list") +
        ".\n" +
        marked(
          "To learn about active projects for the CLI, visit https://firebase.google.com/docs/cli#project_aliases"
        )
    );
  }

  const aliasList = Object.entries(aliases)
    .map(([aname, projectId]) => `  ${aname} (${projectId})`)
    .join("\n");

  throw new FirebaseError(
    "No project active, but project aliases are available.\n\nRun " +
      clc.bold("firebase use <alias>") +
      " with one of these options:\n\n" +
      aliasList
  );
}

/**
 * Fetches the project number, throwing an error if unable to resolve the
 * project identifiers in the context to a number.
 *
 * @param options CLI options.
 * @return the project number, as a string.
 */
export async function needProjectNumber(options: any): Promise<string> {
  if (options.projectNumber) {
    return options.projectNumber;
  }
  const projectId = needProjectId(options);
  const metadata = await getFirebaseProject(projectId);
  options.projectNumber = metadata.projectNumber;
  return options.projectNumber;
}

/**
 * Looks up all aliases for projectId.
 * @param options CLI options.
 * @param projectId A project id to get the aliases for
 */
export function getAliases(options: any, projectId: string): string[] {
  if (options.rc.hasProjects) {
    return Object.entries(options.rc.projects)
      .filter((entry) => entry[1] === projectId)
      .map((entry) => entry[0]);
  }
  return [];
}
