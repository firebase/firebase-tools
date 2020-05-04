import * as clc from "cli-color";
import * as ora from "ora";

import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { FirebaseError } from "../error";
import { AppAndroidShaData, createAppAndroidSha, ShaCertificateType } from "../management/apps";
import { requireAuth } from "../requireAuth";
import * as logger from "../logger";

async function initiateAppAndroidShaCreation(
  projectId: string,
  appId: string,
  options: { shaHash: string; certType: string }
): Promise<AppAndroidShaData> {
  const spinner = ora("Creating Android SHA certificate").start();
  let certificateData;
  try {
    certificateData = await createAppAndroidSha(projectId, appId, options);
    spinner.succeed();
  } catch (err) {
    spinner.fail();
    throw err;
  }

  return certificateData;
}

function getCertHashType(shaHash: string): string {
  shaHash = shaHash.replace(/:/g, "");
  const shaHashCount = shaHash.length;
  if (shaHashCount == 40) return ShaCertificateType.SHA_1.toString();
  if (shaHashCount == 64) return ShaCertificateType.SHA_256.toString();
  return ShaCertificateType.SHA_CERTIFICATE_TYPE_UNSPECIFIED.toString();
}

module.exports = new Command("apps:android:sha:create [appId] [shaHash]")
  .description("add a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(
    async (appId: string = "", shaHash: string = "", options: any): Promise<AppAndroidShaData> => {
      const projectId = getProjectId(options);

      if (!appId) {
        throw new FirebaseError("App ID must not be empty.");
      }

      if (!shaHash) {
        throw new FirebaseError("SHA hash must not be empty.");
      }

      logger.info(
        `Create your SHA certificate hash ${clc.bold(shaHash)} with Android app Id ${clc.bold(
          appId
        )}:`
      );

      const appData = await initiateAppAndroidShaCreation(projectId, appId, {
        shaHash: shaHash,
        certType: getCertHashType(shaHash),
      });

      return appData;
    }
  );
