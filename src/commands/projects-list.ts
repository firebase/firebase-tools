import * as clc from "cli-color";
import * as ora from "ora";
import Table = require("cli-table");

import { Command } from "../command";
import { FirebaseProjectMetadata, listFirebaseProjects } from "../management/projects";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

function logProjectsList(projects: FirebaseProjectMetadata[], currentProjectId: string): void {
  if (projects.length === 0) {
    logger.info(clc.bold("No projects found."));
    return;
  }

  const tableHead = ["Project Display Name", "Project ID", "Resource Location ID"];
  const table = new Table({ head: tableHead, style: { head: ["green"] } });
  projects.forEach(({ projectId, displayName, resources }) => {
    if (projectId === currentProjectId) {
      projectId = clc.cyan.bold(`${projectId} (current)`);
    }
    table.push([
      displayName || NOT_SPECIFIED,
      projectId,
      (resources && resources.locationId) || NOT_SPECIFIED,
    ]);
  });

  logger.info(table.toString());
}

function logProjectCount(count: number = 0): void {
  if (count === 0) {
    return;
  }
  logger.info("");
  logger.info(`${count} project(s) total.`);
}

module.exports = new Command("projects:list")
  .description("list all Firebase projects you have access to")
  .before(requireAuth)
  .action(
    async (options: any): Promise<FirebaseProjectMetadata[]> => {
      const spinner = ora("Preparing the list of your Firebase projects").start();
      let projects;

      try {
        projects = await listFirebaseProjects();
      } catch (err) {
        spinner.fail();
        throw err;
      }

      spinner.succeed();
      logProjectsList(projects, options.project);
      logProjectCount(projects.length);
      return projects;
    }
  );
