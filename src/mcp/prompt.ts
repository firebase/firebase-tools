import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { McpContext, ServerFeature } from "./types";
import { getDefaultFeatureAvailabilityCheck } from "./util/availability";

export interface ServerPrompt {
  mcp: {
    name: string;
    description?: string;
    arguments?: { name: string; description?: string; required?: boolean }[];
    omitPrefix?: boolean;
    annotations?: {
      title?: string;
    };
    _meta?: {
      /** Prompts are grouped by feature. --only can configure what prompts is available. */
      feature?: string;
    };
  };
  fn: (args: Record<string, string>, ctx: McpContext) => Promise<PromptMessage[]>;
  isAvailable: (ctx: McpContext) => Promise<boolean>;
}

export function prompt(
  feature: ServerFeature,
  options: ServerPrompt["mcp"],
  fn: ServerPrompt["fn"],
  isAvailable?: (ctx: McpContext) => Promise<boolean>,
): ServerPrompt {
  return {
    mcp: options,
    fn,
    isAvailable: (ctx) => {
      // default to the feature level availability check, but allow override
      // We resolve this at runtime to allow for easier testing/mocking
      const isAvailableFunc = isAvailable || getDefaultFeatureAvailabilityCheck(feature);
      return isAvailableFunc(ctx);
    },
  };
}
