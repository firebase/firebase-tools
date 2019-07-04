import * as clc from "cli-color";
import * as ora from "ora";
// TODO(caot): Replace with proper import
import Table = require("cli-table");

import * as Command from "../command";
import { listFirebaseProjects } from "../management/list";
import { ProjectMetadata } from "../management/metadata";
import * as requireAuth from "../requireAuth";
import * as logger from "../logger";

const NOT_SPECIFIED = clc.yellow("[Not specified]");

function logProjectsList(projects: ProjectMetadata[], currentProjectId: string): void {
  if (projects.length > 0) {
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
  } else {
    logger.info(clc.bold("No projects found."));
  }
}

module.exports = new Command("projects:list")
  .description("list all Firebase projects you have access to")
  .before(requireAuth)
  .action(
    async (options: any): Promise<ProjectMetadata[]> => {
      const spinner = ora("Preparing the list of your Firebase projects").start();
      try {
        const projects = await listFirebaseProjects();
        spinner.succeed();
        logProjectsList(projects, options.project);
        return projects;
      } catch (err) {
        spinner.fail();
        throw err;
      }
    }
  );
