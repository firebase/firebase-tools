import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getDocuments } from "../../../gcp/firestore.js";
import { FirestoreDelete } from "../../../firestore/delete.js";

export const delete_document = tool(
  {
    name: "delete_document",
    description:
      "Deletes a Firestore documents from a database in the current project by full document paths. Use this if you know the exact path of a document.",
    inputSchema: z.object({
      database: z
        .string()
        .optional()
        .describe("Database id to use. Defaults to `(default)` if unspecified."),
      path: z
        .string()
        .describe(
          "A document path (e.g. `collectionName/documentId` or `parentCollection/parentDocument/collectionName/documentId`)",
        ),
    }),
    annotations: {
      title: "Delete Firestore document",
      destructiveHint: true,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ path, database }, { projectId }) => {
    const { documents, missing } = await getDocuments(projectId, [path], database);
    if (missing.length > 0 && documents && documents.length === 0) {
      return mcpError(`None of the specified documents were found in project '${projectId}'`);
    }

    const firestoreDelete = new FirestoreDelete(projectId, path, {
      databaseId: database ?? "(default)",
    });

    await firestoreDelete.execute();

    const { documents: postDeleteDocuments, missing: postDeleteMissing } = await getDocuments(
      projectId,
      [path],
    );
    if (postDeleteMissing.length > 0 && postDeleteDocuments.length === 0) {
      return toContent(`Successfully removed document located at : ${path}`);
    }

    return mcpError(`Failed to remove document located at : ${path}`);
  },
);
