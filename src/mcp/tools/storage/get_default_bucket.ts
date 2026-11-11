import { z } from "zod";

import { getDefaultBucket } from "../../../gcp/storage";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";

const inputSchema = z.strictObject({});
const bucketError =
  "Unable to retrieve the default Firebase Storage bucket for the selected project.";

export const get_default_bucket = tool(
  "storage",
  {
    name: "get_default_bucket",
    description:
      "Retrieve the linked default Firebase Storage bucket name for the selected project.",
    humanReadableDescription:
      "Retrieve the linked default Firebase Storage bucket name for the selected project.",
    inputSchema,
    annotations: {
      title: "Get Default Storage Bucket",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (input, { projectId }) => {
    if (!inputSchema.safeParse(input).success) {
      return mcpError("This tool accepts no arguments.");
    }

    try {
      const bucketName = await getDefaultBucket(projectId);
      if (typeof bucketName !== "string" || !bucketName.trim() || bucketName.includes("/")) {
        return mcpError(bucketError);
      }
      return toContent(bucketName);
    } catch {
      return mcpError(bucketError);
    }
  },
);
