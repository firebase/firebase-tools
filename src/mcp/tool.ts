import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { z, ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { FirebaseMcpServer } from "./index";

export interface ServerToolContext {
  projectId?: string;
  host: FirebaseMcpServer;
}

export interface ServerTool<InputSchema extends ZodTypeAny = ZodTypeAny> {
  mcp: {
    name: string;
    description?: string;
    inputSchema: any;
    annotations?: {
      title?: string;
      readOnlyHint?: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint?: boolean;
    };
    _meta?: {
      /** Set this on a tool if it *always* requires a project to work. */
      requiresProject?: boolean;
      /** Set this on a tool if it *always* requires a signed-in user to work. */
      requiresAuth?: boolean;
    };
  };
  fn: (input: z.infer<InputSchema>, ctx: ServerToolContext) => Promise<CallToolResult>;
}

export function tool<InputSchema extends ZodTypeAny>(
  options: Omit<ServerTool<InputSchema>["mcp"], "inputSchema"> & {
    inputSchema: InputSchema;
  },
  fn: ServerTool<InputSchema>["fn"],
): ServerTool {
  return {
    mcp: { ...options, inputSchema: zodToJsonSchema(options.inputSchema) },
    fn,
  };
}
