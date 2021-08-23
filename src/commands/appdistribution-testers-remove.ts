import {Command} from "../command";
import * as utils from "../utils";
import {requireAuth} from "../requireAuth";
import {FirebaseError} from "../error";
import {needProjectNumber} from '../projectUtils';
import {AppDistributionClient} from '../appdistribution/client';
import {getEmails} from '../testerEmailParser';


module.exports = new Command("appdistribution:testers:remove [emails...]")
    .description("Delete Testers")
    .option(
        "--file <file>",
        "a path to a file containing a comma separated list of tester emails to be removed"
    )
    .before(requireAuth)
    .action(async (emails: string[], options?: any) => {
      const projectNumber = await needProjectNumber(options);
      const request = new AppDistributionClient();
      const emailsArr = getEmails(emails, options.file);
      let deleteResponse;
      try {
        console.log("Deleting the following testers: " + emailsArr + " from project " + projectNumber);
        deleteResponse = await request.removeTesters(projectNumber, emailsArr);
      } catch (err) {
        throw new FirebaseError(`failed to remove testers.${err}` + {exit: 1});
      }
      if (options.debug) {
        utils.logSuccess(`Testers: ${deleteResponse.emails},have been successfully deleted`);
      } else {
        utils.logSuccess(`${deleteResponse.emails.length} Testers have successfully been deleted`);
      }
    });