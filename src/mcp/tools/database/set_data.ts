import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import * as url from "node:url";
import { stringToStream } from "../../../utils";
import { Client } from "../../../apiv2";
import { getErrMsg } from "../../../error";

export const set_data = tool(
  {
    name: "set_data",
    description: "Writes RTDB data to the specified location",
    inputSchema: z.object({
      databaseUrl: z
        .string()
        .optional()
        .describe(
          "connect to the database at url. If omitted, use default database instance <project>-default-rtdb.firebaseio.com. Can point to emulator URL (e.g. localhost:6000/<instance>)",
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
  },
  async ({ path, databaseUrl, data }, { projectId, host }) => {
    if (!path.startsWith("/")) {
      return mcpError(`paths must start with '/' (you passed '${path}')`);
    }

    const dbUrl = new url.URL(
      databaseUrl
        ? `${databaseUrl}/${path}.json`
        : `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app/${path}.json`,
    );

    const client = new Client({
      urlPrefix: dbUrl.origin,
      auth: true,
    });

    const inStream = stringToStream(data);

    host.logger.debug(`sending write request to path '${path}' for url '${dbUrl.toString()}'`);

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
