import { ErrorCode, McpError, ReadResourceResult } from "@modelcontextprotocol/sdk/types";
import { McpContext } from "../types";
import { docs } from "./docs";
import { init_ai } from "./guides/init_ai";
import { init_auth } from "./guides/init_auth";
import { init_backend } from "./guides/init_backend";
import { init_data_connect } from "./guides/init_data_connect";
import { init_firestore } from "./guides/init_firestore";
import { init_hosting } from "./guides/init_hosting";
import { init_rtdb } from "./guides/init_rtdb";
import { ServerResource, ServerResourceTemplate } from "../resource";

export const resources = [
  init_backend,
  init_ai,
  init_data_connect,
  init_firestore,
  init_rtdb,
  init_auth,
  init_hosting,
];

export const resourceTemplates = [docs];

export async function resolveResource(
  uri: string,
  ctx: McpContext,
): Promise<
  | ({
      result: ReadResourceResult;
    } & (
      | { type: "template"; mcp: ServerResourceTemplate["mcp"] }
      | { type: "resource"; mcp: ServerResource["mcp"] }
    ))
  | null
> {
  // check if an exact resource name matches first
  const resource = resources.find((r) => r.mcp.uri === uri);
  if (resource) {
    const result = await resource.fn(uri, ctx);
    return { type: "resource", mcp: resource.mcp, result };
  }

  // then check if any templates match
  const template = resourceTemplates.find((rt) => rt.match(uri));
  if (template) {
    const result = await template.fn(uri, ctx);
    return { type: "template", mcp: template.mcp, result };
  }

  return null;
}
