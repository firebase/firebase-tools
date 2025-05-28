import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { commitDocument, FirestoreDocument, FirestoreValue } from "../../../gcp/firestore.js";
import { convertInputToValue, firestoreDocumentToJson } from "./converter.js";
import { getFirestoreEmulatorHost } from "./emulator.js";
import { NO_PROJECT_ERROR } from "../../errors.js";

export const commit_document = tool(
  {
    name: "commit_document",
    description:
      "Creates or updates a Firestore document in a database in the current project. If the document does not exist, it will be created. If the document does exist, its contents will be overwritten with the new data.",
    inputSchema: z.object({
      // TODO: Support configurable database
      // database: z
      //   .string()
      //   .nullish()
      //   .describe("Database id to use. Defaults to `(default)` if unspecified."),
      path: z
        .string()
        .describe(
          "A document path (e.g. `collectionName/documentId` or `parentCollection/parentDocument/collectionName/documentId`)",
        ),
      document_data: z
        .record(z.any())
        .describe(
          "A JSON object representing the fields of the document. For special data types like GeoPoint or Timestamp, refer to Firestore documentation for the correct JSON representation or use simpler types like strings/numbers/booleans/arrays/maps.",
        ),
      use_emulator: z.boolean().default(false).describe("Target the Firestore emulator if true."),
    }),
    annotations: {
      title: "Put Firestore document",
    },
    _meta: {
      requiresAuth: true,
      requiresProject: true,
    },
  },
  async ({ path, document_data, use_emulator }, { projectId, host }) => {
    if (!projectId) return NO_PROJECT_ERROR;
    if (use_emulator) {
      const emulatorHost = await getFirestoreEmulatorHost(await host.getEmulatorHubClient());
      if (emulatorHost) {
        process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
      }
    }

    if (!path || Object.keys(document_data).length === 0) {
      return mcpError("Document path and document_data cannot be empty.");
    }

    const fields: { [key: string]: FirestoreValue } = {};
    for (const key in document_data) {
      if (Object.prototype.hasOwnProperty.call(document_data, key)) {
        fields[key] = convertInputToValue(document_data[key]);
      }
    }

    const firestoreDocToPut: Partial<FirestoreDocument> & { fields: { [key: string]: FirestoreValue } } = {
      fields,
    };

    try {
      const result = await commitDocument(projectId, path, firestoreDocToPut as any, use_emulator);
      return toContent(result);
    } catch (err: any) {
      return mcpError(`Failed to put document at path '${path}': ${err.message || err}`);
    }
  },
);