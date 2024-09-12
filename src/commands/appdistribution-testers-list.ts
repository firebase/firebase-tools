import * as ora from "ora";
import { AppDistributionClient } from "../appdistribution/client";
import { getProjectName } from "../appdistribution/options-parser-util";
import { ListTestersResponse, Tester } from "../appdistribution/types";
import { Command } from "../command";
import { logger } from "../logger";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import * as utils from "../utils";

const Table = require("cli-table");

export const command = new Command("appdistribution:testers:list [group]")
  .description("list testers in project")
  .before(requireAuth)
  .action(async (group: string | undefined, options: Options): Promise<ListTestersResponse> => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    let testersResponse: ListTestersResponse;
    const spinner = ora("Preparing the list of your App Distribution testers").start();
    try {
      testersResponse = await appDistroClient.listTesters(projectName, group);
    } catch (err) {
      spinner.fail();
      throw err;
    }
    spinner.succeed();
    const testers = testersResponse.testers ?? [];
    printTestersTable(testers);
    utils.logSuccess(`Testers listed successfully`);
    return testersResponse;
  });

/**
 * Prints a table given a list of testers
 */
export function printTestersTable(testers: Tester[]): void {
  const tableHead = ["Name", "Display Name", "Last Activity Time", "Groups"];

  const table = new Table({
    head: tableHead,
    style: { head: ["green"] },
  });

  for (const tester of testers) {
    const name = tester.name.split("/").pop();
    const groups = tester.groups
      .map((grp) => grp.split("/").pop())
      .sort()
      .join(";");
    table.push([name, tester.displayName ?? "", tester.lastActivityTime, groups]);
  }

  logger.info(table.toString());
}
