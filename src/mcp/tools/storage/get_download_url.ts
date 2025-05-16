import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { getDownloadUrl } from "../../../gcp/storage.js";

export const get_object_download_url = tool(
  {
    name: "get_object_download_url",
    description: "Retrieves the download URL for an object in Firebase Storage.",
    inputSchema: z.object({
      bucket: z
        .string()
        .nullish()
        .describe(
          "The bucket name in Firebase Storage. If not provided, defaults to the project's default bucket (e.g., `{projectid}.firebasestorage.app`).",
        ),
      object_path: z
        .string()
        .describe("The path to the object in Firebase storage without the bucket name attached"),
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
  async ({ bucket, object_path }, { projectId }) => {
    if (!bucket) {
      bucket = `${projectId}.firebasestorage.app`;
    }
    const downloadUrl = await getDownloadUrl(bucket, object_path);
    return toContent(downloadUrl);
  },
);
