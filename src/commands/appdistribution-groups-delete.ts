import { Command } from "../command.js";
import * as utils from "../utils.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError, getErrMsg } from "../error.js";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getProjectName } from "../appdistribution/options-parser-util.js";

export const command = new Command("appdistribution:groups:delete <alias>")
  .description("delete group from a project")
  .alias("appdistribution:group:delete")
  .before(requireAuth)
  .action(async (alias: string, options: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    try {
      utils.logBullet(`Deleting group from project`);
      await appDistroClient.deleteGroup(`${projectName}/groups/${alias}`);
    } catch (err: unknown) {
      throw new FirebaseError(`Failed to delete group ${getErrMsg(err)}`);
    }
    utils.logSuccess(`Group ${alias} has successfully been deleted`);
  });
