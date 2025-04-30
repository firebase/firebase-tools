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

export function mcpError(message: Error | string | unknown, code?: string): CallToolResult {
  let errorMessage = "unknown error";
  if (message instanceof Error) {
    errorMessage = message.message;
  }
  if (typeof message === "string") {
    errorMessage = message;
  }
  return {
    isError: true,
    content: [{ type: "text", text: `"Error: ${code ? `${code}: ` : ""}${errorMessage}` }],
  };
}