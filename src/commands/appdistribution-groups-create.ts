import { Command } from "../command.js";
import * as utils from "../utils.js";
import { requireAuth } from "../requireAuth.js";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getProjectName } from "../appdistribution/options-parser-util.js";

export const command = new Command("appdistribution:groups:create <displayName> [alias]")
  .description("create group in project")
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
