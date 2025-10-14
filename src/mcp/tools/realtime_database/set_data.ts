import { z } from "zod";
import { tool } from "../../tool";
import { McpContext } from "../../types";
import { checkFeatureActive, mcpError, toContent } from "../../util";
import * as url from "node:url";
import { stringToStream } from "../../../utils";
import { Client } from "../../../apiv2";
import { getErrMsg } from "../../../error";
import path from "node:path";

export const set_data = tool(
  {
    name: "set_data",
    description:
      "Use this to write data to the specified location in a Firebase Realtime Database.",
    inputSchema: z.object({
      databaseUrl: z
        .string()
        .optional()
        .describe(
          "connect to the database at url. If omitted, use default database instance <project>-default-rtdb.us-central1.firebasedatabase.app. Can point to emulator URL (e.g. localhost:6000/<instance>)",
        ),
      path: z.string().describe("The path to the data to read. (ex: /my/cool/path)"),
      data: z.string().describe('The JSON to write. (ex: {"alphabet": ["a", "b", "c"]})'),
    }),
    annotations: {
      title: "Set Realtime Database data",
      readOnlyHint: false,
      idempotentHint: true,
    },

    _meta: {
      requiresAuth: false,
      requiresProject: false,
    },
    isAvailable: async (ctx: McpContext) => {
      return await checkFeatureActive("database", ctx.projectId, { config: ctx.config });
    },
  },
  async ({ path: setPath, databaseUrl, data }, { projectId, host }) => {
    if (!setPath.startsWith("/")) {
      return mcpError(`paths must start with '/' (you passed ''${setPath}')`);
    }

    const dbUrl = new url.URL(
      databaseUrl
        ? `${databaseUrl}/${setPath}.json`
        : path.join(
            `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`,
            `${setPath}.json`,
          ),
    );

    const client = new Client({
      urlPrefix: dbUrl.origin,
      auth: true,
    });

    const inStream = stringToStream(data);

    host.logger.debug(`sending write request to path '${setPath}' for url '${dbUrl.toString()}'`);

    try {
      await client.request({
        method: "PUT",
        path: dbUrl.pathname,
        body: inStream,
      });
    } catch (err: unknown) {
      host.logger.debug(getErrMsg(err));
      return mcpError(`Unexpected error while setting data: ${getErrMsg(err)}`);
    }

    return toContent("write successful!");
  },
);
