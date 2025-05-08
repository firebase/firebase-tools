import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { getDownloadUrl } from "../../../gcp/storage.js";

export const get_object_download_url = tool(
  {
    name: "get_object_download_url",
    description: "Retrieves the download URL for an object in Firebase Storage.",
    inputSchema: z.object({
      bucket: z.string().nullish().describe("The bucket name in Firebase Storage."),
      objectPath: z
        .string()
        .describe("The path to the object in Firebase storage without the bucket name attached"),
    }),
    annotations: {
      title: "Get the download url for an obejct in Firebase Storage.",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ bucket, objectPath }, { projectId }) => {
    if (!bucket) {
      bucket = `${projectId}.firebasestorage.app`;
    }
    const downloadUrl = await getDownloadUrl(bucket, objectPath);
    return toContent(downloadUrl);
  },
);
