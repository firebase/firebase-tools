import ora from "ora";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getProjectName } from "../appdistribution/options-parser-util.js";
import { ListTestersResponse, Tester } from "../appdistribution/types.js";
import { Command } from "../command.js";
import { FirebaseError } from "../error.js";
import { logger } from "../logger.js";
import { Options } from "../options.js";
import { requireAuth } from "../requireAuth.js";
import * as utils from "../utils.js";
import Table from "cli-table";
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
    } catch (err: any) {
      spinner.fail();
      throw new FirebaseError("Failed to list testers.", {
        exit: 1,
        original: err,
      });
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
function printTestersTable(testers: Tester[]): void {
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
