import ora from "ora";
import { AppDistributionClient } from "../appdistribution/client";
import { getProjectName } from "../appdistribution/options-parser-util";
import { ListTestersResponse, Tester } from "../appdistribution/types";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { Options } from "../options";
import { requireAuth } from "../requireAuth";
import * as utils from "../utils";
import Table from "cli-table3";

export const command = new Command("appdistribution:testers:list [group]")
  .description("list testers in project")
  .before(requireAuth)
  .action(async (group: string | undefined, options: Options): Promise<ListTestersResponse> => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    let testers: Tester[];
    const spinner = ora("Preparing the list of your App Distribution testers").start();
    try {
      testers = await appDistroClient.listTesters(projectName, group);
    } catch (err: any) {
      spinner.fail();
      throw new FirebaseError("Failed to list testers.", {
        exit: 1,
        original: err,
      });
    }
    spinner.succeed();
    printTestersTable(testers);
    utils.logSuccess(`Testers listed successfully`);
    return { testers };
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
    const groups = (tester.groups ?? [])
      .map((grp) => grp.split("/").pop())
      .sort()
      .join(";");
    table.push([name, tester.displayName ?? "", tester.lastActivityTime.toString(), groups]);
  }

  logger.info(table.toString());
}
