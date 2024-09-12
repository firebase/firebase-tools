import * as ora from "ora";
import { AppDistributionClient } from "../appdistribution/client";
import { getProjectName } from "../appdistribution/options-parser-util";
import { Group, ListGroupsResponse } from "../appdistribution/types";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import * as utils from "../utils";

const Table = require("cli-table");

export const command = new Command("appdistribution:group:list")
  .description("list groups in project")
  .before(requireAuth)
  .action(async (options?: Options): Promise<ListGroupsResponse> => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    let groupsResponse: ListGroupsResponse;
    const spinner = ora("Preparing the list of your App Distribution Groups").start();
    try {
      groupsResponse = await appDistroClient.listGroups(projectName);
    } catch (err) {
      spinner.fail();
      throw new FirebaseError(`Failed to list groups ${err}`);
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
export function printGroupsTable(groups: Group[]): void {
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
