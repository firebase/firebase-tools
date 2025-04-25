/* eslint camelcase: 0 */

import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { existsSync } from "fs";
import { join } from "path";
import { configstore } from "../../../configstore.js";

export const set_firebase_directory = tool(
  {
    name: "set_firebase_directory",
    description:
      "Sets the project directory for the Firebase MCP server to utilize for project detection and authentication. This should be a directory with a `firebase.json` file in it. This information is persisted between sessions.",
    inputSchema: z.object({
      dir: z
        .string()
        .nullable()
        .describe(
          "the absolute path of the directory. set to null to 'unset' the value and fall back to the working directory",
        ),
    }),
    annotations: {
      title: "Set Firebase Project Directory",
      idempotentHint: true,
    },
  },
  async ({ dir }, { host }) => {
    if (dir === null) {
      host.setProjectRoot(null);
      return toContent(
        `Firebase MCP project directory setting deleted. New project root is: ${host.projectRoot || "unset"}`,
      );
    }

    if (!existsSync(dir)) return mcpError(`Directory '${dir}' does not exist.`);
    if (!existsSync(join(dir, "firebase.json")))
      return mcpError(`Directory '${dir}' does not contain a 'firebase.json' file.`);
    host.setProjectRoot(dir);
    return toContent(`Firebase MCP project directory set to '${dir}'.`);
  },
);
