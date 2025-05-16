import { z } from "zod";
import { tool } from "../../tool.js";
import { mcpError, toContent } from "../../util.js";
import { getLatestRulesetName, getRulesetContent } from "../../../gcp/rules.js";

export function getRulesTool(productName: string, releaseName: string) {
  return tool(
    {
      name: "get_rules",
      description: `Retrieves the active ${productName} security rules for the current project.`,
      inputSchema: z.object({}),
      annotations: {
        title: `Get Current ${productName} Rules`,
        readOnlyHint: true,
      },
      _meta: {
        requiresProject: true,
        requiresAuth: true,
      },
    },
    async (_, { projectId }) => {
      const rulesetName = await getLatestRulesetName(projectId!, releaseName);
      if (!rulesetName)
        return mcpError(`No active Firestore rules were found in project '${projectId}'`);
      const rules = await getRulesetContent(rulesetName);
      return toContent(rules[0].content);
    },
  );
}
