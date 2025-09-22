import { z } from "zod";
import { Client } from "../../../apiv2";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getLatestRulesetName, getRulesetContent } from "../../../gcp/rules";

export const get_rules = tool(
  {
    name: "get_rules",
    description: "Retrieves the security rules for a specified Firebase service.",
    inputSchema: z.object({
        type: z.enum(["firestore", "rtdb", "storage"]).describe("The service to get rules for."),
        databaseUrl: z
        .string()
        .optional()
        .describe(
          "Required for RTDB. The database URL to connect to. If omitted, use default database instance <project>-default-rtdb.firebaseio.com. Can point to emulator URL (e.g. localhost:6000/<instance>)",
        ),
    }),
    annotations: {
      title: "Get Firebase Rules",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async ({ type, databaseUrl }, { projectId }) => {
    if (databaseUrl && type !== "rtdb") {
      return mcpError("The 'databaseUrl' argument is only applicable for type 'rtdb'.");
    }
    if (type === "rtdb") {
        const dbUrl =
        databaseUrl ?? `https://${projectId}-default-rtdb.us-central1.firebasedatabase.app`;

      const client = new Client({ urlPrefix: dbUrl });
      const response = await client.request<void, NodeJS.ReadableStream>({
        method: "GET",
        path: "/.settings/rules.json",
        responseType: "stream",
        resolveOnHTTPError: true,
      });
      if (response.status !== 200) {
        return mcpError(`Failed to fetch current rules. Code: ${response.status}`);
      }

      const rules = await response.response.text();
      return toContent(rules);
    }

    let releaseName: string;
    let productName: string;
    if (type === "firestore") {
        productName = "Firestore";
        releaseName = "cloud.firestore";
    } else {
        productName = "Storage";
        releaseName = "firebase.storage";
    }

    const rulesetName = await getLatestRulesetName(projectId, releaseName);
    if (!rulesetName)
      return mcpError(`No active ${productName} rules were found in project '${projectId}'`);
    const rules = await getRulesetContent(rulesetName);
    return toContent(rules[0].content);
  },
);
