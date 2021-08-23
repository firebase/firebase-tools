import {Command} from "../command";
import * as utils from "../utils";
import {requireAuth} from "../requireAuth";
import {FirebaseError} from "../error";
import {needProjectNumber} from '../projectUtils';
import {AppDistributionClient} from '../appdistribution/client';
import {getEmails} from '../testerEmailParser';

module.exports = new Command("appdistribution:testers:add [emails...]")
    .description("Create Testers")
    .option(
        "--file <file>",
        "a path to a file containing a comma separated list of tester emails to be added"
    )
    .before(requireAuth)
    .action(async (emails: string[], options?: any) => {
      const projectNumber = await needProjectNumber(options);
      const request = new AppDistributionClient();
      const emailsArr = getEmails(emails, options.file);
      try {
        console.log("Adding the following testers: " + emailsArr + " to project " + projectNumber);
        console.log(emailsArr.length);
        await request.addTesters(projectNumber, emailsArr);
      } catch (err) {
        throw new FirebaseError(`failed to add testers.${err}` + {exit: 1});
      }
      utils.logSuccess(`Testers Created Successfully`);
    });
