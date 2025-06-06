import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { queryCollection, StructuredQuery } from "../../../gcp/firestore.js";
import { firestoreDocumentToJson } from "./converter.js";
import { Emulators } from "../../../emulator/types.js";
import { CompositeFilter, Order } from "./schema.js";

export const query_collection = tool(
  {
    name: "query_collection",
    description:
      "Retrieves one or more Firestore documents from a collection is a database in the current project by a collection with a full document path. Use this if you know the exact path of a collection and the filtering clause you would like for the document.",
    inputSchema: z.object({
      database: z
        .string()
        .optional()
        .describe("Database id to use. Defaults to `(default)` if unspecified."),
      collection_path: z
        .string()
        .describe(
          "A collection path (e.g. `collectionName/` or `parentCollection/parentDocument/collectionName`)",
        ),
      filter: CompositeFilter.optional().describe(
        "Optional filters to apply to the Firestore query",
      ),
      orderBy: Order.array()
        .optional()
        .describe("Optional ordering to apply to the Firestore query."),
      limit: z
        .number()
        .describe("The maximum amount of records to return. Default is 10.")
        .optional(),
      use_emulator: z.boolean().default(false).describe("Target the Firestore emulator if true."),
    }),
    annotations: {
      title: "Query Firestore collection",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async (
    { collection_path, filter, orderBy, limit, database, use_emulator },
    { projectId, host },
  ) => {
    // database ??= "(default)";

    if (!collection_path || !collection_path.length)
      return mcpError("Must supply at least one collection path.");

    const structuredQuery: StructuredQuery = {
      from: [{ collectionId: collection_path, allDescendants: false }],
    };
    if (filter) {
      structuredQuery.where = {
        compositeFilter: filter,
      };
    }
    if (orderBy) {
      structuredQuery.orderBy = orderBy;
    }
    structuredQuery.limit = limit ? limit : 10;

    let emulatorUrl: string | undefined;
    if (use_emulator) {
      emulatorUrl = await host.getEmulatorUrl(Emulators.FIRESTORE);
    }

    const { documents } = await queryCollection(projectId, structuredQuery, database, emulatorUrl);
    const docs = documents.map(firestoreDocumentToJson);
    return toContent(docs);
  },
);
