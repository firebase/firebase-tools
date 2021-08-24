import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { needProjectNumber } from "../projectUtils";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails } from "../appdistribution/options-parser-util";

module.exports = new Command("appdistribution:testers:add [emails...]")
  .description("Add testers")
  .option("--file <file>", "a path to a file containing a list of tester emails to be added")
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectNumber = await needProjectNumber(options);
    const appDistroClient = new AppDistributionClient();
    const emailsArr = getEmails(emails, options.file);
    try {
      console.log(`Adding ${emailsArr.length} testers to project ${projectNumber}`);
      await appDistroClient.addTesters(projectNumber, emailsArr);
    } catch (err) {
      throw new FirebaseError(`Failed to add testers ${err}` + { exit: 1 });
    }
    utils.logSuccess(`Testers created successfully`);
  });
