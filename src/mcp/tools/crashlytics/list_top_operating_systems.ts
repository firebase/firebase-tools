import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { listTopOperatingSystems } from "../../../crashlytics/listTopOperatingSystems";
import { APP_ID_FIELD } from "./constants";

export const list_top_operating_systems = tool(
  {
    name: "list_top_operating_systems",
    description: "List the top operating systems from Crashlytics for an application.",
    inputSchema: z.object({
      app_id: APP_ID_FIELD,
      issue_id: z.string().optional().describe("The issue id to filter on"),
      os_count: z
        .number()
        .optional()
        .default(10)
        .describe(
          "Number of operating systems that needs to be fetched. Defaults to 10 if unspecified.",
        ),
    }),
    annotations: {
      title: "List Top Crashlytics Operating Systems.",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ app_id, issue_id, os_count }) => {
    if (!app_id) return mcpError(`Must specify 'app_id' parameter.`);

    os_count ??= 10;
    return toContent(await listTopOperatingSystems(app_id, os_count, issue_id));
  },
);
