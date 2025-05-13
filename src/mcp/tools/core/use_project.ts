import { z } from "zod";
import { tool } from "../../tool.js";
import { setNewActive } from "../../../commands/use.js";
import { mcpError, toContent } from "../../util.js";

export const use_project = tool(
  {
    name: "use_project",
    description: "Select a Firebase Project to use for subsequent tool calls.",
    inputSchema: z.object({
      project: z.string().describe("The project id, number, or alias to use."),
    }),
    annotations: {
      title: "Select a Firebase Project to use for subsequent tool calls.",
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: false,
    },
  },
  async ({ project }, { config, rc }) => {
    try {
      await setNewActive(project, undefined, rc, config.projectDir);
    } catch (err: any) {
      return mcpError(
        `Unable to set ${project} as active project. Got error ${JSON.stringify(err, null, 2)}`,
      );
    }
    return toContent(`The active Firebase project has been set to ${project}.`);
  },
);
