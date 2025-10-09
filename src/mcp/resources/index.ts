import { ReadResourceResult } from "@modelcontextprotocol/sdk/types";
import { McpContext } from "../types";
import { docs } from "./docs";
import { init_ai } from "./guides/init_ai";
import { init_auth } from "./guides/init_auth";
import { init_backend } from "./guides/init_backend";
import { init_firestore } from "./guides/init_firestore";
import { init_firestore_rules } from "./guides/init_firestore_rules";
import { init_data_connect } from "./guides/init_data_connect";
import { init_database } from "./guides/init_database";
import { init_hosting } from "./guides/init_hosting";
import { ServerResource, ServerResourceTemplate } from "../resource";
import { trackGA4 } from "../../track";

export const resources = [
  init_backend,
  init_ai,
  init_database,
  init_data_connect,
  init_firestore,
  init_firestore_rules,
  init_auth,
  init_hosting,
];

export const resourceTemplates = [docs];

export async function resolveResource(
  uri: string,
  ctx: McpContext,
  track: boolean = true,
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
    if (track) void trackGA4("mcp_read_resource", { resource_name: uri });
    const result = await resource.fn(uri, ctx);
    return { type: "resource", mcp: resource.mcp, result };
  }

  // then check if any templates match
  const template = resourceTemplates.find((rt) => rt.match(uri));
  if (template) {
    if (track) void trackGA4("mcp_read_resource", { resource_name: uri });
    const result = await template.fn(uri, ctx);
    return { type: "template", mcp: template.mcp, result };
  }
  if (track) void trackGA4("mcp_read_resource", { resource_name: uri, not_found: "true" });
  return null;
}

/**
 * Generates a markdown table of all available resources and their descriptions.
 * This is used for generating documentation.
 */
export function markdownDocsOfResources(): string {
  const allResources = [...resources, ...resourceTemplates];
  const headings = `
| Resource Name | Description |
| ------------- | ----------- |`;
  const resourceRows = allResources.map((res) => {
    let desc = res.mcp.title ? `${res.mcp.title}: ` : "";
    desc += res.mcp.description || "";
    desc = desc.replaceAll("\n", "<br>");
    return `
| ${res.mcp.name} | ${desc} |`;
  });
  return headings + resourceRows.join("");
}
