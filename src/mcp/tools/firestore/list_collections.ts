import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { listCollectionIds } from "../../../gcp/firestore";
import { Emulators } from "../../../emulator/types";

export const list_collections = tool(
  "firestore",
  {
    name: "list_collections",
    description:
      "Use this to retrieve a list of collections from a Firestore database in the current project.",
    inputSchema: z.object({
      // TODO: support multiple databases
      database: z
        .string()
        .optional()
        .describe("Database id to use. Defaults to `(default)` if unspecified."),
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
  async ({ database, use_emulator }, { projectId, host }) => {
    // database ??= "(default)";
    let emulatorUrl: string | undefined;
    if (use_emulator) {
      emulatorUrl = await host.getEmulatorUrl(Emulators.FIRESTORE);
    }
    return toContent(await listCollectionIds(projectId, database, emulatorUrl));
  },
);
