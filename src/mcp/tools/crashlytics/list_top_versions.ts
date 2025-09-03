import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopVersions } from "../../../crashlytics/listTopVersions";
import { APP_ID_FIELD } from "./constants";

export const list_top_versions = tool(
  {
    name: "list_top_versions",
    description: "List the top versions from Crashlytics for an application.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().optional().describe("The issue id to filter on"),
      version_count: z
        .number()
        .optional()
        .default(10)
        .describe("Number of versions that needs to be fetched. Defaults to 10 if unspecified."),
    }),
    annotations: {
      title: "List Top Crashlytics Versions.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, version_count }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    version_count ??= 10;
    return toContent(await listTopVersions(app_id, version_count, issue_id));
  },
);
