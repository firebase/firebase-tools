import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { z, ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { FirebaseMcpServer } from "./index";
import type { Config } from "../config";
import { RC } from "../rc";
import { cleanSchema } from "./util";

export interface ServerPromptContext {
  projectId: string;
  accountEmail: string | null;
  config: Config;
  host: FirebaseMcpServer;
  rc: RC;
}

export interface ServerPrompt<InputSchema extends ZodTypeAny = ZodTypeAny> {
  mcp: {
    name: string;
    description?: string;
    inputSchema: any;
    omitPrefix?: boolean;
    annotations?: {
      title?: string;
    };
    _meta?: {
      /** Prompts are grouped by feature. --only can configure what prompts is available. */
      feature?: string;
    };
  };
  fn: (input: z.infer<InputSchema>, ctx: ServerPromptContext) => Promise<PromptMessage[]>;
}

export function prompt<InputSchema extends ZodTypeAny>(
  options: Omit<ServerPrompt<InputSchema>["mcp"], "inputSchema" | "name"> & {
    name: string;
    inputSchema: InputSchema;
    omitPrefix?: boolean;
  },
  fn: ServerPrompt<InputSchema>["fn"],
): ServerPrompt {
  return {
    mcp: { ...options, inputSchema: cleanSchema(zodToJsonSchema(options.inputSchema)) },
    fn,
  };
}
