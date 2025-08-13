import { z } from "zod";
import { Client } from "../../../apiv2";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { updateRulesWithClient } from "../../../rtdb";
import { getErrMsg } from "../../../error";

export const validate_rules = tool(
  {
    name: "validate_rules",
    description: "Validates an RTDB database's rules",
    inputSchema: z.object({
      databaseUrl: z
        .string()
        .optional()
        .describe(
          "connect to the database at url. If omitted, use default database instance <project>-default-rtdb.firebaseio.com. Can point to emulator URL (e.g. localhost:6000/<instance>)",
        ),
      rules: z
        .string()
        .describe(
          'The rules object, as a string (ex: {"rules": {".read": false, ".write": false}})',
        ),
    }),
    annotations: {
      title: "Validate Realtime Database rules",
      idempotentHint: true,
    },

    _meta: {
      requiresAuth: true,
      requiresProject: false,
    },
  },
  async ({ databaseUrl, rules }, { projectId, host }) => {
    const dbUrl =
      databaseUrl ?? `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`;

    const client = new Client({ urlPrefix: dbUrl });

    try {
      await updateRulesWithClient(client, rules, { dryRun: true });
    } catch (e: unknown) {
      host.logger.debug(`failed to validate rules at url ${dbUrl}`);
      return mcpError(getErrMsg(e));
    }

    return toContent("the inputted rules are valid!");
  },
);
