import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { McpContext } from "./types";

export interface ServerResource {
  mcp: {
    uri: string;
    name: string;
    description?: string;
    title?: string;
    _meta?: {
      /** Set this on a resource if it *always* requires a signed-in user to work. */
      requiresAuth?: boolean;
      /** Set this on a resource if it uses Gemini in Firebase API in any way. */
      requiresGemini?: boolean;
    };
  };
  fn: (uri: string, ctx: McpContext) => Promise<ReadResourceResult>;
}

export function resource(
  options: ServerResource["mcp"],
  fnOrText: ServerResource["fn"] | string,
): ServerResource {
  const fn: ServerResource["fn"] =
    typeof fnOrText === "string"
      ? async (uri) => ({ contents: [{ uri, text: fnOrText }] })
      : fnOrText;
  return { mcp: options, fn };
}
