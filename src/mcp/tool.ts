import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { McpContext, ServerFeature } from "./types";
import { cleanSchema } from "./util";
import { getDefaultFeatureAvailabilityCheck } from "./util/availability";

export interface ServerTool<InputSchema extends ZodTypeAny = ZodTypeAny> {
  mcp: {
    name: string;
    description?: string;
    inputSchema: any;
    annotations?: {
      title?: string;

      // If this tool modifies data or not.
      readOnlyHint?: boolean;

      // this tool can destroy data.
      destructiveHint?: boolean;

      // this tool is safe to run multiple times.
      idempotentHint?: boolean;

      // If this is true, it connects to the internet or other open world
      // systems. If false, the tool only performs actions in an enclosed
      // system, such as your project.
      openWorldHint?: boolean;
    };
    _meta?: {
      /** Set this on a tool if it cannot work without a Firebase project directory. */
      optionalProjectDir?: boolean;
      /** Set this on a tool if it *always* requires a project to work. */
      requiresProject?: boolean;
      /** Set this on a tool if it *always* requires a signed-in user to work. */
      requiresAuth?: boolean;
      /** Set this on a tool if it uses Gemini in Firebase API in any way. */
      requiresGemini?: boolean;
      /** Tools are grouped by feature. --only can configure what tools is available. */
      feature?: string;
    };
  };
  fn: (input: z.infer<InputSchema>, ctx: McpContext) => Promise<CallToolResult>;
  isAvailable: (ctx: McpContext) => Promise<boolean>;
}

export function tool<InputSchema extends ZodTypeAny>(
  feature: ServerFeature,
  options: Omit<ServerTool<InputSchema>["mcp"], "inputSchema"> & {
    inputSchema: InputSchema;
    isAvailable?: (ctx: McpContext) => Promise<boolean>;
  },
  fn: ServerTool<InputSchema>["fn"],
): ServerTool {
  const { isAvailable, ...mcpOptions } = options;

  // default to the feature level availability check, but allow override
  const isAvailableFunc = isAvailable || getDefaultFeatureAvailabilityCheck(feature);

  return {
    mcp: { ...mcpOptions, inputSchema: cleanSchema(zodToJsonSchema(options.inputSchema)) },
    fn,
    isAvailable: isAvailableFunc,
  };
}
