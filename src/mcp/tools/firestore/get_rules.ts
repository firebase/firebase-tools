import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getLatestRulesetName, getRulesetContent } from "../../../gcp/rules.js";

export const get_rules = tool(
  {
    name: "get_rules",
    description: "Retrieves the active Firestore security rules for the current project.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Current Firestore Rules",
      readOnlyHint: true,
    },
    _meta: {
      requiresProject: true,
      requiresAuth: true,
    },
  },
  async (_, { projectId }) => {
    const rulesetName = await getLatestRulesetName(projectId!, "cloud.firestore");
    if (!rulesetName)
      return mcpError(`No active Firestore rules were found in project '${projectId}'`);
    const rules = await getRulesetContent(rulesetName);
    return toContent(rules[0].content);
  },
);
