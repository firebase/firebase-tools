import * as fs from "fs-extra";

import { Command } from "../command";
import * as utils from "../utils";
import { requireAuth } from "../requireAuth";
import {
  AabInfo,
  IntegrationState,
  AppDistributionClient,
  UploadReleaseResult,
} from "../appdistribution/client";
import { FirebaseError } from "../error";
import { Distribution, DistributionFileType } from "../appdistribution/distribution";
import {
  ensureFileExists,
  getAppName,
  getTestersOrGroups,
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
  .description("upload a release binary")
  .option("--app <app_id>", "the app id of your Firebase app")
  .option("--release-notes <string>", "release notes to include")
  .option("--release-notes-file <file>", "path to file with release notes")
  .option("--testers <string>", "a comma separated list of tester emails to distribute to")
  .option(
    "--testers-file <file>",
    "path to file with a comma separated list of tester emails to distribute to",
  )
  .option("--groups <string>", "a comma separated list of group aliases to distribute to")
  .option(
    "--groups-file <file>",
    "path to file with a comma separated list of group aliases to distribute to",
  )
  .before(requireAuth)
  .action(async (file: string, options: any) => {
    const appName = getAppName(options);
    const distribution = new Distribution(file);
    const releaseNotes = getReleaseNotes(options.releaseNotes, options.releaseNotesFile);
    const testers = getTestersOrGroups(options.testers, options.testersFile);
    const groups = getTestersOrGroups(options.groups, options.groupsFile);
    const requests = new AppDistributionClient();
    let aabInfo: AabInfo | undefined;

    if (distribution.distributionFileType() === DistributionFileType.AAB) {
      try {
        aabInfo = await requests.getAabInfo(appName);
      } catch (err: any) {
        if (err.status === 404) {
          throw new FirebaseError(
            `App Distribution could not find your app ${options.app}. ` +
              `Make sure to onboard your app by pressing the "Get started" ` +
              "button on the App Distribution page in the Firebase console: " +
              "https://console.firebase.google.com/project/_/appdistribution",
            { exit: 1 },
          );
        }
        throw new FirebaseError(`failed to determine AAB info. ${err.message}`, { exit: 1 });
      }

      if (
        aabInfo.integrationState !== IntegrationState.INTEGRATED &&
        aabInfo.integrationState !== IntegrationState.AAB_STATE_UNAVAILABLE
      ) {
        switch (aabInfo.integrationState) {
          case IntegrationState.PLAY_ACCOUNT_NOT_LINKED: {
            throw new FirebaseError("This project is not linked to a Google Play account.");
          }
          case IntegrationState.APP_NOT_PUBLISHED: {
            throw new FirebaseError('"This app is not published in the Google Play console.');
          }
          case IntegrationState.NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT: {
            throw new FirebaseError(
              "App with matching package name does not exist in Google Play.",
            );
          }
          case IntegrationState.PLAY_IAS_TERMS_NOT_ACCEPTED: {
            throw new FirebaseError(
              "You must accept the Play Internal App Sharing (IAS) terms to upload AABs.",
            );
          }
          default: {
            throw new FirebaseError(
              "App Distribution failed to process the AAB: " + aabInfo.integrationState,
            );
          }
        }
      }
    }

    utils.logBullet("uploading binary...");
    let releaseName;
    try {
      const operationName = await requests.uploadRelease(appName, distribution);

      // The upload process is asynchronous, so poll to figure out when the upload has finished successfully
      const uploadResponse = await requests.pollUploadStatus(operationName);

      const release = uploadResponse.release;
      switch (uploadResponse.result) {
        case UploadReleaseResult.RELEASE_CREATED:
          utils.logSuccess(
            `uploaded new release ${release.displayVersion} (${release.buildVersion}) successfully!`,
          );
          break;
        case UploadReleaseResult.RELEASE_UPDATED:
          utils.logSuccess(
            `uploaded update to existing release ${release.displayVersion} (${release.buildVersion}) successfully!`,
          );
          break;
        case UploadReleaseResult.RELEASE_UNMODIFIED:
          utils.logSuccess(
            `re-uploaded already existing release ${release.displayVersion} (${release.buildVersion}) successfully!`,
          );
          break;
        default:
          utils.logSuccess(
            `uploaded release ${release.displayVersion} (${release.buildVersion}) successfully!`,
          );
      }
      utils.logSuccess(`View this release in the Firebase console: ${release.firebaseConsoleUri}`);
      utils.logSuccess(`Share this release with testers who have access: ${release.testingUri}`);
      utils.logSuccess(
        `Download the release binary (link expires in 1 hour): ${release.binaryDownloadUri}`,
      );
      releaseName = uploadResponse.release.name;
    } catch (err: any) {
      if (err.status === 404) {
        throw new FirebaseError(
          `App Distribution could not find your app ${options.app}. ` +
            `Make sure to onboard your app by pressing the "Get started" ` +
            "button on the App Distribution page in the Firebase console: " +
            "https://console.firebase.google.com/project/_/appdistribution",
          { exit: 1 },
        );
      }
      throw new FirebaseError(`failed to upload release. ${err.message}`, { exit: 1 });
    }

    // If this is an app bundle and the certificate was originally blank fetch the updated
    // certificate and print
    if (aabInfo && !aabInfo.testCertificate) {
      aabInfo = await requests.getAabInfo(appName);
      if (aabInfo.testCertificate) {
        utils.logBullet(
          "After you upload an AAB for the first time, App Distribution " +
            "generates a new test certificate. All AAB uploads are re-signed with this test " +
            "certificate. Use the certificate fingerprints below to register your app " +
            "signing key with API providers, such as Google Sign-In and Google Maps.\n" +
            `MD-1 certificate fingerprint: ${aabInfo.testCertificate.hashMd5}\n` +
            `SHA-1 certificate fingerprint: ${aabInfo.testCertificate.hashSha1}\n` +
            `SHA-256 certificate fingerprint: ${aabInfo.testCertificate.hashSha256}`,
        );
      }
    }

    // Add release notes and distribute to testers/groups
    await requests.updateReleaseNotes(releaseName, releaseNotes);
    await requests.distribute(releaseName, testers, groups);
  });
