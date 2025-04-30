import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { listCollectionIds } from "../../../gcp/firestore.js";
import { NO_PROJECT_ERROR } from "../../errors.js";

export const list_collections = tool(
  {
    name: "list_collections",
    description:
      "Retrieves a list of collections from a Firestore database in the current project.",
    inputSchema: z.object({
      // TODO: support multiple databases
      // database: z
      //   .string()
      //   .nullish()
      //   .describe("Database id to use. Defaults to `(default)` if unspecified."),
    }),
    annotations: {
      title: "List Firestore collections",
      readOnlyHint: true,
    },
  },
  async (_, { projectId }) => {
    // database ??= "(default)";
    if (!projectId) return NO_PROJECT_ERROR;
    try {
      return toContent(await listCollectionIds(projectId));
    } catch (err: unknown) {
      if (err instanceof Error) {
        return mcpError(err.message);
      } else {
        return mcpError("unknown error");
      }
    }
  },
);
