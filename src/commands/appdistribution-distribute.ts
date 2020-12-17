import * as fs from "fs-extra";

import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import { AppDistributionApp, AppDistributionClient, UploadStatus } from "../appdistribution/client";
import { FirebaseError } from "../error";
import { Distribution } from "../appdistribution/distribution";

function ensureFileExists(file: string, message = ""): void {
  if (!fs.existsSync(file)) {
    throw new FirebaseError(`File ${file} does not exist: ${message}`);
  }
}

function getAppId(appId: string): string {
  if (!appId) {
    throw new FirebaseError("set the --app option to a valid Firebase app id and try again");
  }
  return appId;
}

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

function getTestersOrGroups(value: string, file: string): string[] {
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  if (value) {
    return value
      .split(/,|\n/)
      .map((entry) => entry.trim())
      .filter((entry) => !!entry);
  }

  return [];
}

module.exports = new Command("appdistribution:distribute <distribution-file>")
  .description("upload a distribution")
  .option("--app <app_id>", "the app id of your Firebase app")
  .option("--release-notes <string>", "release notes to include with this distribution")
  .option(
    "--release-notes-file <file>",
    "path to file with release notes to include with this distribution"
  )
  .option("--testers <string>", "a comma separated list of tester emails to distribute to")
  .option(
    "--testers-file <file>",
    "path to file with a comma separated list of tester emails to distribute to"
  )
  .option("--groups <string>", "a comma separated list of group aliases to distribute to")
  .option(
    "--groups-file <file>",
    "path to file with a comma separated list of group aliases to distribute to"
  )
  .before(requireAuth)
  .action(async (file: string, options: any) => {
    const appId = getAppId(options.app);
    const distribution = new Distribution(file);
    const releaseNotes = getReleaseNotes(options.releaseNotes, options.releaseNotesFile);
    const testers = getTestersOrGroups(options.testers, options.testersFile);
    const groups = getTestersOrGroups(options.groups, options.groupsFile);
    const requests = new AppDistributionClient(appId);
    let app: AppDistributionApp;

    try {
      app = await requests.getApp();
    } catch (err) {
      if (err.status === 404) {
        throw new FirebaseError(
          `App Distribution could not find your app ${appId}. ` +
            `Make sure to onboard your app by pressing the "Get started" ` +
            "button on the App Distribution page in the Firebase console: " +
            "https://console.firebase.google.com/project/_/appdistribution",
          { exit: 1 }
        );
      }
      throw new FirebaseError(`failed to fetch app information. ${err.message}`, { exit: 1 });
    }

    if (!app.contactEmail) {
      throw new FirebaseError(
        `We could not find a contact email for app ${appId}. Please visit App Distribution within ` +
          "the Firebase Console to set one up.",
        { exit: 1 }
      );
    }

    let binaryName = await distribution.binaryName(app);

    // Upload the distribution if it hasn't been uploaded before
    let releaseId: string;
    const uploadStatus = await requests.getUploadStatus(binaryName);
    if (uploadStatus.status === UploadStatus.SUCCESS) {
      utils.logWarning("this distribution has been uploaded before, skipping upload");
      releaseId = uploadStatus.release.id;
    } else {
      // If there's an error, we know that the distribution hasn't been uploaded before
      utils.logBullet("uploading distribution...");

      try {
        binaryName = await requests.uploadDistribution(distribution);

        // The upload process is asynchronous, so poll to figure out when the upload has finished successfully
        releaseId = await requests.pollUploadStatus(binaryName);
        utils.logSuccess("uploaded distribution successfully!");
      } catch (err) {
        throw new FirebaseError(`failed to upload distribution. ${err.message}`, { exit: 1 });
      }
    }

    // Add release notes and testers/groups
    await requests.addReleaseNotes(releaseId, releaseNotes);
    await requests.enableAccess(releaseId, testers, groups);
  });
