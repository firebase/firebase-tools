import { z } from "zod";
import { Client } from "../../../apiv2";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";

export const get_rules = tool(
  {
    name: "get_rules",
    description: "Get an RTDB database's rules",
    inputSchema: z.object({
      databaseUrl: z
        .string()
        .optional()
        .describe(
          "connect to the database at url. If omitted, use default database instance <project>-default-rtdb.firebaseio.com. Can point to emulator URL (e.g. localhost:6000/<instance>)",
        ),
    }),
    annotations: {
      title: "Get Realtime Database rules",
      readOnlyHint: true,
    },

    _meta: {
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async ({ databaseUrl }, { projectId }) => {
    const dbUrl =
      databaseUrl ?? `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`;

    const client = new Client({ urlPrefix: dbUrl });
    const response = await client.request<void, NodeJS.ReadableStream>({
      method: "GET",
      path: "/.settings/rules.json",
      responseType: "stream",
      resolveOnHTTPError: true,
    });
    if (response.status !== 200) {
      return mcpError(`Failed to fetch current rules. Code: ${response.status}`);
    }

    const rules = await response.response.text();
    return toContent(rules);
  },
);
