import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { createAppAndroidSha, ShaCertificateType } from "../../../management/apps.js";

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
    description: "Adds a SHA certificate hash to an existing Android app.",
    inputSchema: z.object({
      appId: z.string().describe("The Android app ID to add the SHA certificate to."),
      shaHash: z.string().describe("The SHA certificate hash to add (SHA-1 or SHA-256)."),
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
  async ({ appId, shaHash }, { projectId }) => {
    // Add the SHA certificate
    const certType = getCertHashType(shaHash);
    const shaCertificate = await createAppAndroidSha(projectId!, appId, {
      shaHash,
      certType,
    });

    return toContent({
      ...shaCertificate,
      message: `Successfully added ${certType} certificate to Android app ${appId}`,
    });
  },
);
