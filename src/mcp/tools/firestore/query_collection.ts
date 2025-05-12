import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { queryCollection, StructuredQuery } from "../../../gcp/firestore.js";
import { convertInputToValue, firestoreDocumentToJson } from "./converter.js";

export const query_collection = tool(
  {
    name: "query_collection",
    description:
      "Retrieves one or more Firestore documents from a collection is a database in the current project by a collection with a full document path. Use this if you know the exact path of a collection and the filtering clause you would like for the document.",
    inputSchema: z.object({
      // TODO: Support configurable database
      // database: z
      //   .string()
      //   .nullish()
      //   .describe("Database id to use. Defaults to `(default)` if unspecified."),
      collectionPath: z
        .string()
        .describe(
          "A collection path (e.g. `collectionName/` or `parentCollection/parentDocument/collectionName`)",
        ),
      filter: z.object({
        where: z
          .object({
            field: z.string().describe("the field searching against"),
            op: z
              .enum([
                "OPERATOR_UNSPECIFIED",
                "LESS_THAN",
                "LESS_THAN_OR_EQUAL",
                "GREATER_THAN",
                "GREATER_THAN_OR_EQUAL",
                "EQUAL",
                "NOT_EQUAL",
                "ARRAY_CONTAINS",
                "ARRAY_CONTAINS_ANY",
                "IN",
                "NOT_IN",
              ])
              .describe("the equality evaluator to use"),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
              .describe("the value to compare against"),
          })
          .nullish(),
        order: z
          .object({
            orderBy: z.string().describe("the field to order by"),
            orderByDirection: z
              .enum(["ASCENDING", "DESCENDING", "DIRECTION_UNSPECIFIED"])
              .describe("the direction to order values"),
          })
          .nullish(),
      }),
      limit: z
        .number()
        .describe("The maximum amount of records to return. Default is 10.")
        .nullish(),
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
  async ({ collectionPath, filter, limit }, { projectId }) => {
    // database ??= "(default)";

    if (!collectionPath || !collectionPath.length)
      return mcpError("Must supply at least one collection path.");

    const structuredQuery: StructuredQuery = {
      from: [{ collectionId: collectionPath, allDescendants: false }],
    };
    console.error(JSON.stringify(filter));
    if (filter.where) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: filter.where.field },
          op: filter.where.op,
          value: convertInputToValue(filter.where.value),
        },
      };
    }
    if (filter.order) {
      structuredQuery.orderBy = [
        {
          field: { fieldPath: filter.order.orderBy },
          direction: filter.order.orderByDirection,
        },
      ];
    }
    structuredQuery.limit = limit ? limit : 10;

    console.error(JSON.stringify(structuredQuery));
    const { documents } = await queryCollection(projectId!, structuredQuery);

    const docs = documents.map(firestoreDocumentToJson);

    const docsContent = toContent(docs);

    return docsContent;
  },
);
