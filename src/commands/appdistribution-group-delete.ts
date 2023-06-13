import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";
import { logger } from "../logger";

export const command = new Command("appdistribution:group:delete <alias>")
  .description("delete group from a project")
  .before(requireAuth)
  .action(async (alias: string, options: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    try {
      utils.logBullet(`Deleting group from project`);
      await appDistroClient.deleteGroup(`${projectName}/groups/${alias}`);
    } catch (err: any) {
      throw new FirebaseError(`Failed to delete group ${err}`);
    }
    utils.logSuccess(`Group ${alias} has successfully been deleted`);
  });
