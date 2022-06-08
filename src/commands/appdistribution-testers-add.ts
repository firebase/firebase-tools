import { Command } from "../command.js";
import * as utils from "../utils.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError } from "../error.js";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util.js";
import { needProjectNumber } from "../projectUtils.js";

export const command = new Command("appdistribution:testers:add [emails...]")
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
