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
      requiresProject?: boolean;
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
