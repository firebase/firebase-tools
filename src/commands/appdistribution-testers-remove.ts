import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { needProjectNumber } from "../projectUtils";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails } from "../appdistribution/options-parser-util";

module.exports = new Command("appdistribution:testers:remove [emails...]")
  .description("Remove testers")
  .option("--file <file>", "a path to a file containing a list of tester emails to be removed")
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectNumber = await needProjectNumber(options);
    const appDistroClient = new AppDistributionClient();
    const emailsArr = getEmails(emails, options.file);
    let deleteResponse;
    try {
      console.log(`Deleting ${emailsArr.length} testers from project ${projectNumber}`);
      deleteResponse = await appDistroClient.removeTesters(projectNumber, emailsArr);
    } catch (err) {
      throw new FirebaseError(`Failed to remove testers ${err}` + { exit: 1 });
    }
    if (deleteResponse.emails != null) {
      if (options.debug) {
        utils.logSuccess(`Testers: ${deleteResponse.emails}, have been successfully deleted`);
      } else {
        utils.logSuccess(`${deleteResponse.emails.length} testers have successfully been deleted`);
      }
    } else {
      utils.logSuccess(`Testers specified did not exist`);
    }
  });
