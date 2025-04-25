import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { dump } from "js-yaml";

export function toContent(data: any, options?: { format: "json" | "yaml" }): CallToolResult {
  if (typeof data === "string") return { content: [{ type: "text", text: data }] };

  let text: string = "";
  const format = options?.format || "yaml"; // use YAML because it's a little more prose-like for the LLM to parse
  switch (format) {
    case "json":
      text = JSON.stringify(data);
      break;
    case "yaml":
      text = dump(data);
      break;
  }
  return {
    content: [{ type: "text", text }],
  };
}

export function mcpError(message: string, code?: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `"Error: ${code ? `${code}: ` : ""}${message}` }],
  };
}
