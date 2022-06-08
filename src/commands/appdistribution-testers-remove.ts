import { Command } from "../command.js";
import * as utils from "../utils.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError } from "../error.js";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util.js";
import { logger } from "../logger.js";

export const command = new Command("appdistribution:testers:remove [emails...]")
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
    } catch (err: any) {
      throw new FirebaseError(`Failed to remove testers ${err}`);
    }

    if (!deleteResponse.emails) {
      utils.logSuccess(`Testers did not exist`);
      return;
    }
    logger.debug(`Testers: ${deleteResponse.emails}, have been successfully deleted`);
    utils.logSuccess(`${deleteResponse.emails.length} testers have successfully been deleted`);
  });
