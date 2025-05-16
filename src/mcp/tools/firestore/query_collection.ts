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
      collection_path: z
        .string()
        .describe(
          "A collection path (e.g. `collectionName/` or `parentCollection/parentDocument/collectionName`)",
        ),
      filters: z
        .object({
          compare_value: z
            .object({
              string_value: z.string().nullish().describe("The string value to compare against."),
              boolean_value: z.string().nullish().describe("The boolean value to compare against."),
              string_array_value: z
                .array(z.string())
                .nullish()
                .describe("The string value to compare against."),
              integer_value: z.number().nullish().describe("The integer value to compare against."),
              double_value: z.number().nullish().describe("The double value to compare against."),
            })
            .describe("One and only one value may be specified per filters object."),
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
        })
        .array()
        .describe("the multiple filters to use in querying against the existing collection."),
      order: z
        .object({
          orderBy: z.string().describe("the field to order by"),
          orderByDirection: z
            .enum(["ASCENDING", "DESCENDING"])
            .describe("the direction to order values"),
        })
        .nullish()
        .describe(
          "Specifies the field and direction to order the results. If not provided, the order is undefined.",
        ),
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
  async ({ collection_path, filters, order, limit }, { projectId }) => {
    // database ??= "(default)";

    if (!collection_path || !collection_path.length)
      return mcpError("Must supply at least one collection path.");

    const structuredQuery: StructuredQuery = {
      from: [{ collectionId: collection_path, allDescendants: false }],
    };
    if (filters) {
      structuredQuery.where = {
        compositeFilter: {
          op: "AND",
          filters: filters.map((f) => {
            if (
              f.compare_value.boolean_value &&
              f.compare_value.double_value &&
              f.compare_value.integer_value &&
              f.compare_value.string_array_value &&
              f.compare_value.string_value
            ) {
              throw mcpError("One and only one value may be specified per filters object.");
            }
            const out = Object.entries(f.compare_value).filter(([, value]) => {
              return value !== null && value !== undefined;
            });
            return {
              fieldFilter: {
                field: { fieldPath: f.field },
                op: f.op,
                value: convertInputToValue(out[0][1]),
              },
            };
          }),
        },
      };
    }
    if (order) {
      structuredQuery.orderBy = [
        {
          field: { fieldPath: order.orderBy },
          direction: order.orderByDirection,
        },
      ];
    }
    structuredQuery.limit = limit ? limit : 10;

    const { documents } = await queryCollection(projectId!, structuredQuery);

    const docs = documents.map(firestoreDocumentToJson);

    const docsContent = toContent(docs);

    return docsContent;
  },
);
