import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { AppDistributionClient } from "../appdistribution/client";
import { getEmails, getProjectName } from "../appdistribution/options-parser-util";

export const command = new Command("appdistribution:testers:add [emails...]")
  .description(
    "add testers to a project (and optionally to an App Distribution group); requires either [emails...] or --file",
  )
  .option(
    "--file <file>",
    "path to a comma- or newline-separated file of tester emails to add (ignored if [emails...] are passed)",
  )
  .option(
    "--group-alias <group-alias>",
    "also add the testers to the App Distribution group with this alias",
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
