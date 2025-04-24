import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export function toContent(data: any): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function mcpError(message: string, code?: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `"Error: ${code ? `${code}: ` : ""}${message}` }],
  };
}
