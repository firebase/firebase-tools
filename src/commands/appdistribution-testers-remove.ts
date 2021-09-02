import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";
import { logger } from "../logger";

module.exports = new Command("appdistribution:testers:remove [emails...]")
  .description("remove testers from a project")
  .option("--file <file>", "a path to a file containing a list of tester emails to be removed")
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    const emailsArr = getEmails(emails, options.file);
    let deleteResponse;
    try {
      utils.logBullet(`Deleting ${emailsArr.length} testers from project`);
      deleteResponse = await appDistroClient.removeTesters(projectName, emailsArr);
    } catch (err) {
      throw new FirebaseError(`Failed to remove testers ${err}`);
    }

    if (!deleteResponse.emails) {
      utils.logSuccess(`Testers did not exist`);
      return;
    }
    logger.debug(`Testers: ${deleteResponse.emails}, have been successfully deleted`);
    utils.logSuccess(`${deleteResponse.emails.length} testers have successfully been deleted`);
  });
