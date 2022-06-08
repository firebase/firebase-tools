import * as clc from "cli-color";

import { Command } from "../command.js";
import { needProjectId } from "../projectUtils.js";
import { AppAndroidShaData, createAppAndroidSha, ShaCertificateType } from "../management/apps.js";
import { requireAuth } from "../requireAuth.js";
import { promiseWithSpinner } from "../utils.js";

function getCertHashType(shaHash: string): string {
  shaHash = shaHash.replace(/:/g, "");
  const shaHashCount = shaHash.length;
  if (shaHashCount === 40) return ShaCertificateType.SHA_1.toString();
  if (shaHashCount === 64) return ShaCertificateType.SHA_256.toString();
  return ShaCertificateType.SHA_CERTIFICATE_TYPE_UNSPECIFIED.toString();
}

export const command = new Command("apps:android:sha:create <appId> <shaHash>")
  .description("add a SHA certificate hash for a given app id.")
  .before(requireAuth)
  .action(
    async (appId: string = "", shaHash: string = "", options: any): Promise<AppAndroidShaData> => {
      const projectId = needProjectId(options);

      const shaCertificate = await promiseWithSpinner<AppAndroidShaData>(
        async () =>
          await createAppAndroidSha(projectId, appId, {
            shaHash: shaHash,
            certType: getCertHashType(shaHash),
          }),
        `Creating Android SHA certificate ${clc.bold(
          options.shaHash
        )}with Android app Id ${clc.bold(appId)}`
      );

      return shaCertificate;
    }
  );
