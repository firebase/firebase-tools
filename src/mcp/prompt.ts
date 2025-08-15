import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import type { FirebaseMcpServer } from "./index";
import type { Config } from "../config";
import { RC } from "../rc";

export interface ServerPromptContext {
  projectId: string;
  accountEmail: string | null;
  config: Config;
  host: FirebaseMcpServer;
  rc: RC;
}

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
  fn: (args: Record<string, string>, ctx: ServerPromptContext) => Promise<PromptMessage[]>;
}

export function prompt(options: ServerPrompt["mcp"], fn: ServerPrompt["fn"]): ServerPrompt {
  return {
    mcp: options,
    fn,
  };
}
