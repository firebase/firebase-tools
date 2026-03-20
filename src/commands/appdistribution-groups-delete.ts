import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError, getErrMsg } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getProjectName } from "../appdistribution/options-parser-util";

export const command = new Command("appdistribution:groups:delete <alias>")
  .description("delete an App Distribution group")
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
