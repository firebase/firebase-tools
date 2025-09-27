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

export interface ServerResourceTemplate {
  mcp: {
    uriTemplate: string;
    /** How to know if a URI matches this template, can be a string (prefix), regex, or function. */
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
  match: (uri: string) => boolean;
  fn: (uri: string, ctx: McpContext) => Promise<ReadResourceResult>;
}

export function resourceTemplate(
  options: ServerResourceTemplate["mcp"] & {
    match: string | RegExp | ServerResourceTemplate["match"];
  },
  fnOrText: ServerResourceTemplate["fn"] | string,
): ServerResourceTemplate {
  let matchFn: ServerResourceTemplate["match"];
  const { match, ...mcp } = options;

  if (match instanceof RegExp) {
    matchFn = (uri) => match.test(uri);
  } else if (typeof match === "string") {
    matchFn = (uri) => uri.startsWith(match);
  } else {
    matchFn = match;
  }

  const fn: ServerResourceTemplate["fn"] =
    typeof fnOrText === "string"
      ? async (uri) => ({ contents: [{ uri, text: fnOrText }] })
      : fnOrText;
  return { mcp, match: matchFn, fn };
}
