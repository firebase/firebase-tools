import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { listCollectionIds } from "../../../gcp/firestore.js";
import { NO_PROJECT_ERROR } from "../../errors.js";
import { getFirestoreEmulatorUrl } from "./emulator.js";

export const list_collections = tool(
  {
    name: "list_collections",
    description:
      "Retrieves a list of collections from a Firestore database in the current project.",
    inputSchema: z.object({
      // TODO: support multiple databases
      // database: z
      //   .string()
      //   .optional()
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
    let emulatorUrl: string | undefined;
    if (use_emulator) {
      emulatorUrl = await getFirestoreEmulatorUrl(await host.getEmulatorHubClient());
    }

    if (!projectId) return NO_PROJECT_ERROR;
    return toContent(await listCollectionIds(projectId, emulatorUrl));
  },
);
