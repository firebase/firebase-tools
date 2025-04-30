import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
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
      document_path: z
        .string()
        .nullish()
        .describe(
          "a parent document to list subcollections under. only needed for subcollections, omit to list top-level collections",
        ),
    }),
    annotations: {
      title: "List Firestore collections",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (_, { projectId }) => {
    // database ??= "(default)";
    if (!projectId) return NO_PROJECT_ERROR;
    return toContent(await listCollectionIds(projectId));
  },
);
