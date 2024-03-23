import * as clc from "colorette";
import * as ora from "ora";
const Table = require("cli-table");

import { Command } from "../command";
import { listFirebaseProjects } from "../management/projects";
import { FirebaseProjectMetadata } from "../types/project";
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
      projectId = clc.cyan(clc.bold(`${projectId} (current)`));
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
    },
  );
