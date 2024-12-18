import ora from "ora";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getProjectName } from "../appdistribution/options-parser-util.js";
import { Group, ListGroupsResponse } from "../appdistribution/types.js";
import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import { logger } from "../logger.js";
import { Options } from "../options.js";
import { requireAuth } from "../requireAuth.js";
import * as utils from "../utils.js";
import Table from "cli-table";
export const command = new Command("appdistribution:groups:list")
  .description("list groups in project")
  .alias("appdistribution:group:list")
  .before(requireAuth)
  .action(async (options?: Options): Promise<ListGroupsResponse> => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    let groupsResponse: ListGroupsResponse;
    const spinner = ora("Preparing the list of your App Distribution Groups").start();
    try {
      groupsResponse = await appDistroClient.listGroups(projectName);
    } catch (err: any) {
      spinner.fail();
      throw new FirebaseError("Failed to list groups.", {
        exit: 1,
        original: err,
      });
    }
    spinner.succeed();
    const groups = groupsResponse.groups ?? [];
    printGroupsTable(groups);
    utils.logSuccess(`Groups listed successfully`);
    return groupsResponse;
  });

/**
 * Prints a table given a list of groups
 */
function printGroupsTable(groups: Group[]): void {
  const tableHead = ["Group", "Display Name", "Tester Count", "Release Count", "Invite Link Count"];

  const table = new Table({
    head: tableHead,
    style: { head: ["green"] },
  });

  for (const group of groups) {
    const name = group.name.split("/").pop();
    table.push([
      name,
      group.displayName,
      group.testerCount || 0,
      group.releaseCount || 0,
      group.inviteLinkCount || 0,
    ]);
  }

  logger.info(table.toString());
}
