import * as fs from "fs-extra";

import { Command } from "../command";
import { requireAuth } from "../requireAuth";
import { FirebaseError, getErrMsg, getErrStatus } from "../error";
import {
  awaitTestResults,
  Distribution,
  DistributionFileType,
  upload,
} from "../appdistribution/distribution";
import {
  ensureFileExists,
  getAppName,
  getLoginCredential,
  parseTestDevices,
  parseIntoStringArray,
} from "../appdistribution/options-parser-util";
import {
  AabInfo,
  IntegrationState,
  LoginCredential,
  ReleaseTest,
  TestDevice,
} from "../appdistribution/types";
import { AppDistributionClient } from "../appdistribution/client";
import * as utils from "../utils";

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

    await distribute({
      appName,
      distribution,
      testCases,
      testDevices,
      releaseNotes,
      testers,
      groups,
      testNonBlocking: options.testNonBlocking,
      loginCredential,
    });
  });

/**
 * Execute an app distribution action
 */
export async function distribute({
  appName,
  distribution,
  testCases = undefined,
  testDevices = undefined,
  releaseNotes = undefined,
  testers = undefined,
  groups = undefined,
  testNonBlocking = undefined,
  loginCredential = undefined,
}: {
  appName: string;
  distribution: Distribution;
  testCases?: string[];
  testDevices?: TestDevice[];
  releaseNotes?: string;
  testers?: string[];
  groups?: string[];
  testNonBlocking?: boolean;
  loginCredential?: LoginCredential;
}) {
  const requests = new AppDistributionClient();
  let aabInfo: AabInfo | undefined;
  if (distribution.distributionFileType() === DistributionFileType.AAB) {
    try {
      aabInfo = await requests.getAabInfo(appName);
    } catch (err: unknown) {
      if (getErrStatus(err) === 404) {
        throw new FirebaseError(
          `App Distribution could not find your app ${appName}. ` +
            `Make sure to onboard your app by pressing the "Get started" ` +
            "button on the App Distribution page in the Firebase console: " +
            "https://console.firebase.google.com/project/_/appdistribution",
          { exit: 1 },
        );
      }
      throw new FirebaseError(`failed to determine AAB info. ${getErrMsg(err)}`, { exit: 1 });
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
          throw new FirebaseError("App with matching package name does not exist in Google Play.");
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

  const releaseName = await upload(requests, appName, distribution);

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

  // Run automated tests
  if (testDevices && testDevices.length) {
    utils.logBullet("starting automated test (note: this feature is in beta)");
    const releaseTestPromises: Promise<ReleaseTest>[] = [];
    if (testCases && testCases.length) {
      for (const testCaseId of testCases) {
        releaseTestPromises.push(
          requests.createReleaseTest({
            releaseName,
            devices: testDevices,
            loginCredential,
            testCaseName: `${appName}/testCases/${testCaseId}`,
          }),
        );
      }
    } else {
      // fallback to basic automated test
      releaseTestPromises.push(
        requests.createReleaseTest({ releaseName, devices: testDevices, loginCredential }),
      );
    }
    const releaseTests = await Promise.all(releaseTestPromises);
    utils.logSuccess(`${releaseTests.length} release test(s) started successfully`);
    if (!testNonBlocking) {
      await awaitTestResults(releaseTests, requests);
    }
  }
}
