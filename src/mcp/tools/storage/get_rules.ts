import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { getLatestRulesetName, getRulesetContent } from "../../../gcp/rules";

export const get_rules = tool(
  {
    name: "get_rules",
    description: "Retrieves the Firebase Cloud Storage Rules for the default bucket.",
    inputSchema: z.object({}), // TODO: Support multiple buckets
    annotations: {
      title: "Get Current Firebase Cloud Storage Rules",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (_, { projectId }) => {
    const rulesetName = await getLatestRulesetName(projectId, "firebase.storage");
    if (!rulesetName)
      return mcpError(`No active Firebase Storage rules were found in project '${projectId}'`);
    const rules = await getRulesetContent(rulesetName);
    return toContent(rules[0].content);
  },
);
