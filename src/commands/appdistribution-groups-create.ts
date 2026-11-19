import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { AppDistributionClient } from "../appdistribution/client";
import { getProjectName } from "../appdistribution/options-parser-util";

export const command = new Command("appdistribution:groups:create <displayName> [alias]")
  .description(
    "create an App Distribution tester group with a human-readable <displayName> and an optional " +
      "[alias] (the group's unique ID, used by other appdistribution commands and flags); " +
      "if [alias] is omitted, one is generated automatically and printed on success",
  )
  .alias("appdistribution:group:create")
  .before(requireAuth)
  .action(async (displayName: string, alias?: string, options?: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    utils.logBullet(`Creating group in project`);
    const group = await appDistroClient.createGroup(projectName, displayName, alias);
    alias = group.name.split("/").pop();
    utils.logSuccess(`Group '${group.displayName}' (alias: ${alias}) created successfully`);
  });
