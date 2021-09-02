import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";
import { needProjectNumber } from "../projectUtils";

module.exports = new Command("appdistribution:testers:add [emails...]")
  .description("add testers to project")
  .option("--file <file>", "a path to a file containing a list of tester emails to be added")
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    const emailsToAdd = getEmails(emails, options.file);
    utils.logBullet(`Adding ${emailsToAdd.length} testers to project`);
    await appDistroClient.addTesters(projectName, emailsToAdd);
  });
