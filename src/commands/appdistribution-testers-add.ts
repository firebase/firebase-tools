import { Command } from "../command.js";
import * as utils from "../utils.js";
import { requireAuth } from "../requireAuth.js";
import { AppDistributionClient } from "../appdistribution/client.js";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util.js";

export const command = new Command("appdistribution:testers:add [emails...]")
  .description("add testers to project (and possibly group)")
  .option("--file <file>", "a path to a file containing a list of tester emails to be added")
  .option(
    "--group-alias <group-alias>",
    "if specified, the testers are also added to the group identified by this alias",
  )
  .before(requireAuth)
  .action(async (emails: string[], options?: any) => {
    const projectName = await getProjectName(options);
    const appDistroClient = new AppDistributionClient();
    const emailsToAdd = getEmails(emails, options.file);
    utils.logBullet(`Adding ${emailsToAdd.length} testers to project`);
    await appDistroClient.addTesters(projectName, emailsToAdd);
    if (options.groupAlias) {
      utils.logBullet(`Adding ${emailsToAdd.length} testers to group`);
      await appDistroClient.addTestersToGroup(
        `${projectName}/groups/${options.groupAlias}`,
        emailsToAdd,
      );
    }
  });
