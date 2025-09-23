import { z } from "zod";
import { Client } from "../../../apiv2";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getLatestRulesetName, getRulesetContent } from "../../../gcp/rules";
import { getDefaultDatabaseInstance } from "../../../getDefaultDatabaseInstance";

export const get_rules = tool(
  {
    name: "get_rules",
    description: "Retrieves the security rules for a specified Firebase service.",
    inputSchema: z.object({
      type: z.enum(["firestore", "rtdb", "storage"]).describe("The service to get rules for."),
      // TODO: Add a resourceID argument that lets you choose non default buckets/dbs.
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
  async ({ type }, { projectId }) => {
    if (type === "rtdb") {
      const dbUrl = await getDefaultDatabaseInstance(projectId);

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

    const serviceInfo = {
      firestore: { productName: "Firestore", releaseName: "cloud.firestore" },
      storage: { productName: "Storage", releaseName: "firebase.storage" },
    };
    const { productName, releaseName } = serviceInfo[type];

    const rulesetName = await getLatestRulesetName(projectId, releaseName);
    if (!rulesetName)
      return mcpError(`No active ${productName} rules were found in project '${projectId}'`);
    const rules = await getRulesetContent(rulesetName);
    return toContent(rules?.[0].content ?? "Ruleset contains no rules files.");
  },
);
