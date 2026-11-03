import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError, getErrMsg } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";
import { logger } from "../logger";

export const command = new Command("appdistribution:testers:remove [emails...]")
  .description(
    "delete testers from a project, or only remove them from an App Distribution group with --group-alias; requires either [emails...] or --file",
  )
  .option(
    "--file <file>",
    "path to a comma- or newline-separated file of tester emails to remove (ignored if [emails...] are passed)",
  )
  .option(
    "--group-alias <group-alias>",
    "only remove the testers from the App Distribution group with this alias; testers are not deleted from the project",
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
      } catch (err: unknown) {
        throw new FirebaseError(`Failed to remove testers ${getErrMsg(err)}`);
      }

      if (!deleteResponse.emails) {
        utils.logSuccess(`Testers did not exist`);
        return;
      }
      logger.debug(`Testers: ${deleteResponse.emails}, have been successfully deleted`);
      utils.logSuccess(`${deleteResponse.emails.length} testers have successfully been deleted`);
    }
  });
