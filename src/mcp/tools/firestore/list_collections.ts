import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { listCollectionIds } from "../../../gcp/firestore.js";
import { NO_PROJECT_ERROR } from "../../errors.js";
import { getFirestoreEmulatorHost } from "./emulator.js";

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
      use_emulator: z.boolean().default(false).describe("Target the Firestore emulator if true."),
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
  async ({ use_emulator }, { projectId, host }) => {
    // database ??= "(default)";
    if (!projectId) return NO_PROJECT_ERROR;

    if (use_emulator) {
      const emulatorHost = await getFirestoreEmulatorHost(await host.getEmulatorHubClient());
      process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
    }

    return toContent(await listCollectionIds(projectId, use_emulator));
  },
);
