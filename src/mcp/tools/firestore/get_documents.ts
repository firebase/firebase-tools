import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getDocuments } from "../../../gcp/firestore.js";
import { firestoreDocumentToJson } from "./converter.js";

export const get_documents = tool(
  {
    name: "get_documents",
    description:
      "Retrieves one or more Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.",
    inputSchema: z.object({
      // TODO: Support configurable database
      // database: z
      //   .string()
      //   .nullish()
      //   .describe("Database id to use. Defaults to `(default)` if unspecified."),
      paths: z
        .array(z.string())
        .describe(
          "One or more document paths (e.g. `collectionName/documentId` or `parentCollection/parentDocument/collectionName/documentId`)",
        ),
    }),
    annotations: {
      title: "Get Firestore documents",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ paths }, { projectId }) => {
    // database ??= "(default)";
    if (!paths.length) return mcpError("Must supply at least one document path.");

    const { documents, missing } = await getDocuments(projectId!, paths);
    if (missing.length > 0 && documents.length === 0) {
      return mcpError(`None of the specified documents were found in project '${projectId}'`);
    }

    const docs = documents.map(firestoreDocumentToJson);

    if (documents.length === 1 && missing.length === 0) {
      // return a single document as YAML if that's all we have/need
      return toContent(docs[0]);
    }
    const docsContent = toContent(docs);
    if (missing.length) {
      docsContent.content = [
        { type: "text", text: "Retrieved documents:\n\n" },
        ...docsContent.content,
        {
          type: "text",
          text: `The following documents do not exist: ${missing.join(", ")}`,
        },
      ];
    }
    return docsContent;
  },
);
