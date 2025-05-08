import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { detectProjectRoot } from "../../../detectProjectRoot.js";

export const get_project_directory = tool(
  {
    name: "get_project_directory",
    description:
      "Gets the current Firebase project directory. If this has been set using the `set_project_directory` tool it will return that, otherwise it will look for a PROJECT_ROOT environment variable or the current working directory of the running Firebase MCP server.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Firebase Project Directory",
      readOnlyHint: true,
    },
  },
  (_, { host }) => {
    if (!detectProjectRoot({ cwd: host.projectRoot }))
      return Promise.resolve(
        mcpError(
          `There is no detected 'firebase.json' in directory '${host.projectRoot}'. Please use the 'set_project_directory' tool to activate a Firebase project directory.`,
        ),
      );
    return Promise.resolve(
      toContent(`The current Firebase project directory is '${host.projectRoot}'.`),
    );
  },
);
