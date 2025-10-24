import { z } from "zod";

import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import * as backend from "../../../deploy/functions/backend";
import { getErrMsg } from "../../../error";
import * as args from "../../../deploy/functions/args";

export const list_functions = tool(
  "functions",
  {
    name: "list_functions",
    description: "List all deployed functions in your Firebase project.",
    inputSchema: z.object({}), // this tool does not have input
    annotations: {
      title: "List Deployed Functions",
      readOnlyHint: true,
      openWorldHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (_, { projectId }) => {
    const context = {
      projectId,
    } as args.Context;

    try {
      // fetches info about all currently deployed functions for the project
      const existing = await backend.existingBackend(context);
      // extracts all the function endpoints and sorts them
      const endpointsList = backend.allEndpoints(existing).sort(backend.compareFunctions);

      // below format differs from Firebase CLI command output to be more suitable format for agents
      const formattedList = endpointsList.map((endpoint) => ({
        function: endpoint.id,
        version: endpoint.platform === "gcfv2" ? "v2" : "v1",
        trigger: backend.endpointTriggerType(endpoint),
        location: endpoint.region,
        memory: endpoint.availableMemoryMb || "---",
        runtime: endpoint.runtime,
      }));

      if (!formattedList.length) {
        return toContent([], {
          contentPrefix: "No functions found in this project.\n\n",
        });
      }

      return toContent(formattedList);
    } catch (err) {
      const errMsg = getErrMsg((err as any)?.original || err, "Failed to list functions.");
      return mcpError(errMsg);
    }
  },
);
