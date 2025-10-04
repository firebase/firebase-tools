import * as fs from "fs-extra";

import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { distribute, Distribution } from "../appdistribution/distribution";
import {
  ensureFileExists,
  getAppName,
  getLoginCredential,
  parseTestDevices,
  parseIntoStringArray,
} from "../appdistribution/options-parser-util";

function getReleaseNotes(releaseNotes: string, releaseNotesFile: string): string {
  if (releaseNotes) {
    // Un-escape new lines from argument string
    return releaseNotes.replace(/\\n/g, "\n");
  } else if (releaseNotesFile) {
    ensureFileExists(releaseNotesFile);
    return fs.readFileSync(releaseNotesFile, "utf8");
  }
  return "";
}

export const command = new Command("appdistribution:distribute <release-binary-file>")
  .description(
    "upload a release binary and optionally distribute it to testers and run automated tests",
  )
  .option("--app <app_id>", "the app id of your Firebase app")
  .option("--release-notes <string>", "release notes to include")
  .option("--release-notes-file <file>", "path to file with release notes")
  .option("--testers <string>", "a comma-separated list of tester emails to distribute to")
  .option(
    "--testers-file <file>",
    "path to file with a comma- or newline-separated list of tester emails to distribute to",
  )
  .option("--groups <string>", "a comma-separated list of group aliases to distribute to")
  .option(
    "--groups-file <file>",
    "path to file with a comma- or newline-separated list of group aliases to distribute to",
  )
  .option(
    "--test-devices <string>",
    "semicolon-separated list of devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .option(
    "--test-devices-file <string>",
    "path to file containing a list of semicolon- or newline-separated devices to run automated tests on, in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'. Run 'gcloud firebase test android|ios models list' to see available devices. Note: This feature is in beta.",
  )
  .option("--test-username <string>", "username for automatic login")
  .option(
    "--test-password <string>",
    "password for automatic login. If using a real password, use --test-password-file instead to avoid putting sensitive info in history and logs.",
  )
  .option("--test-password-file <string>", "path to file containing password for automatic login")
  .option(
    "--test-username-resource <string>",
    "resource name for the username field for automatic login",
  )
  .option(
    "--test-password-resource <string>",
    "resource name for the password field for automatic login",
  )
  .option(
    "--test-non-blocking",
    "run automated tests without waiting for them to complete. Visit the Firebase console for the test results.",
  )
  .option("--test-case-ids <string>", "a comma-separated list of test case IDs.")
  .option(
    "--test-case-ids-file <file>",
    "path to file with a comma- or newline-separated list of test case IDs.",
  )
  .before(requireAuth)
  .action(async (file: string, options: any) => {
    const appName = getAppName(options);
    const distribution = new Distribution(file);
    const releaseNotes = getReleaseNotes(options.releaseNotes, options.releaseNotesFile);
    const testers = parseIntoStringArray(options.testers, options.testersFile);
    const groups = parseIntoStringArray(options.groups, options.groupsFile);
    const testCases = parseIntoStringArray(options.testCaseIds, options.testCaseIdsFile);
    const testDevices = parseTestDevices(options.testDevices, options.testDevicesFile);
    if (testCases.length && (options.testUsernameResource || options.testPasswordResource)) {
      throw new FirebaseError(
        "Password and username resource names are not supported for the testing agent.",
      );
    }
    const loginCredential = getLoginCredential({
      username: options.testUsername,
      password: options.testPassword,
      passwordFile: options.testPasswordFile,
      usernameResourceName: options.testUsernameResource,
      passwordResourceName: options.testPasswordResource,
    });

    await distribute(
      appName,
      distribution,
      testCases,
      testDevices,
      releaseNotes,
      testers,
      groups,
      options.testNonBlocking,
      loginCredential,
    );
  });
