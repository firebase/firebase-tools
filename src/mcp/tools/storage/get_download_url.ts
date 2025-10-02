import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { getDownloadUrl } from "../../../gcp/storage";
import { Emulators } from "../../../emulator/types";

export const get_object_download_url = tool(
  {
    name: "get_object_download_url",
    description: "Use this to retrieve the download URL for an object in Firebase Storage.",
    inputSchema: z.object({
      bucket: z
        .string()
        .optional()
        .describe(
          "The bucket name in Firebase Storage. If not provided, defaults to the project's default bucket (e.g., `{projectid}.firebasestorage.app`).",
        ),
      object_path: z
        .string()
        .describe("The path to the object in Firebase storage without the bucket name attached"),
      use_emulator: z.boolean().default(false).describe("Target the Storage emulator if true."),
    }),
    annotations: {
      title: "Get Storage Object Download URL",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ bucket, object_path, use_emulator }, { projectId, host }) => {
    if (!bucket) {
      bucket = `${projectId}.firebasestorage.app`;
    }

    let emulatorUrl: string | undefined;
    if (use_emulator) {
      emulatorUrl = await host.getEmulatorUrl(Emulators.STORAGE);
    }

    const downloadUrl = await getDownloadUrl(bucket, object_path, emulatorUrl);
    return toContent(downloadUrl);
  },
);
