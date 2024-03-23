import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";
import { logger } from "../logger";

export const command = new Command("appdistribution:testers:remove [emails...]")
  .description("remove testers from a project (or group)")
  .option("--file <file>", "a path to a file containing a list of tester emails to be removed")
  .option(
    "--group-alias <group-alias>",
    "if specified, the testers are only removed from the group identified by this alias, but not the project",
  )
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    const emailsArr = getEmails(emails, options.file);
    if (options.groupAlias) {
      utils.logBullet(`Removing ${emailsArr.length} testers from group`);
      await appDistroClient.removeTestersFromGroup(
        `${projectName}/groups/${options.groupAlias}`,
        emailsArr,
      );
    } else {
      let deleteResponse;
      try {
        utils.logBullet(`Deleting ${emailsArr.length} testers from project`);
        deleteResponse = await appDistroClient.removeTesters(projectName, emailsArr);
      } catch (err: any) {
        throw new FirebaseError(`Failed to remove testers ${err}`);
      }

      if (!deleteResponse.emails) {
        utils.logSuccess(`Testers did not exist`);
        return;
      }
      logger.debug(`Testers: ${deleteResponse.emails}, have been successfully deleted`);
      utils.logSuccess(`${deleteResponse.emails.length} testers have successfully been deleted`);
    }
  });
