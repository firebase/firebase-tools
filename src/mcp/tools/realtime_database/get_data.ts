import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import * as url from "node:url";
import { Client } from "../../../apiv2";
import { text } from "node:stream/consumers";
import path from "node:path";

export const get_data = tool(
  {
    name: "get_data",
    description:
      "Use this to retrieve data from the specified location in a Firebase Realtime Database.",
    inputSchema: z.object({
      databaseUrl: z
        .string()
        .optional()
        .describe(
          "connect to the database at url. If omitted, use default database instance <project>-default-rtdb.firebasedatabase.app. Can point to emulator URL (e.g. localhost:6000/<instance>)",
        ),
      path: z.string().describe("The path to the data to read. (ex: /my/cool/path)"),
    }),
    annotations: {
      title: "Get Realtime Database data",
      readOnlyHint: true,
    },

    _meta: {
      // it's possible that a user attempts to query a database that they aren't
      // authed into: we should let the rules evaluate as the author intended.
      // If they have written rules to leave paths public, then having mcp
      // grab their data is perfectly valid.
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async ({ path: getPath, databaseUrl }, { projectId, host }) => {
    if (!getPath.startsWith("/")) {
      return mcpError(`paths must start with '/' (you passed ''${getPath}')`);
    }

    const dbUrl = new url.URL(
      databaseUrl
        ? `${databaseUrl}/${getPath}.json`
        : path.join(
            `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`,
            `${getPath}.json`,
          ),
    );

    const client = new Client({
      urlPrefix: dbUrl.origin,
      auth: true,
    });

    host.logger.debug(`sending read request to path '${getPath}' for url '${dbUrl.toString()}'`);

    const res = await client.request<unknown, NodeJS.ReadableStream>({
      method: "GET",
      path: dbUrl.pathname,
      responseType: "stream",
      resolveOnHTTPError: true,
    });

    const content = await text(res.body);
    return toContent(content);
  },
);
