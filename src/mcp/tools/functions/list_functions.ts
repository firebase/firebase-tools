import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import * as backend from "../../../deploy/functions/backend.js";
import * as args from "../../../deploy/functions/args.js";

export const list_functions = tool(
  {
    name: "list",
    description:
      "Retrieves a list of all deployed Firebase Functions within a specified project and location.",
    inputSchema: z.object({
      location: z
        .string()
        .optional()
        .describe(
          "The location of the functions. If not specified, all functions from all regions will be returned.",
        ),
    }),
    annotations: {
      title: "List Deployed Functions",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ location }, { projectId }) => {
    const context = {
      projectId: projectId,
    } as args.Context;
    const existing = await backend.existingBackend(context);
    let endpointsList = backend.allEndpoints(existing);

    if (location) {
      endpointsList = endpointsList.filter((endpoint) => endpoint.region === location);
    }

    return toContent(endpointsList);
  },
);
