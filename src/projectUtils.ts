"use strict";

import { RC } from "./rc";

const _ = require("lodash");
const clc = require("cli-color");
const marked = require("marked");

const { FirebaseError } = require("./error");

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
 * command context.
 * @returns {String} The projectId
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
  if (!project) {
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
          ),
        {
          exit: 1,
        }
      );
    } else {
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
  }
  return projectId || project;
}
