import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { createAppAndroidSha, ShaCertificateType } from "../../../management/apps";

/**
 * Determines the certificate type based on the SHA hash length
 */
function getCertHashType(shaHash: string): string {
  shaHash = shaHash.replace(/:/g, "");
  const shaHashCount = shaHash.length;
  if (shaHashCount === 40) return ShaCertificateType.SHA_1.toString();
  if (shaHashCount === 64) return ShaCertificateType.SHA_256.toString();
  return ShaCertificateType.SHA_CERTIFICATE_TYPE_UNSPECIFIED.toString();
}

export const create_android_sha = tool(
  {
    name: "create_android_sha",
    description:
      "Use this to add the specified SHA certificate hash to the specified Firebase Android App.",
    inputSchema: z.object({
      app_id: z.string().describe("The Android app ID to add the SHA certificate to."),
      sha_hash: z.string().describe("The SHA certificate hash to add (SHA-1 or SHA-256)."),
    }),
    annotations: {
      title: "Add SHA Certificate to Android App",
      destructiveHint: false,
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ app_id, sha_hash }, { projectId }) => {
    // Add the SHA certificate
    const certType = getCertHashType(sha_hash);
    const shaCertificate = await createAppAndroidSha(projectId, app_id, {
      shaHash: sha_hash,
      certType,
    });

    return toContent({
      ...shaCertificate,
      message: `Successfully added ${certType} certificate to Android app ${app_id}`,
    });
  },
);
