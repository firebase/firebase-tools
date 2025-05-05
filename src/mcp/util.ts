import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { execSync } from "child_process";
import { dump } from "js-yaml";
import { platform } from "os";

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
    content: [{ type: "text", text: `Error: ${code ? `${code}: ` : ""}${errorMessage}` }],
  };
}

export function commandExistsSync(command: string): boolean {
  try {
    const isWindows = platform() === "win32";
    // For Windows, `where` is more appropriate. It also often outputs the path.
    // For Unix-like systems, `which` is standard.
    // The `2> nul` (Windows) or `2>/dev/null` (Unix) redirects stderr to suppress error messages.
    // The `>` nul / `>/dev/null` redirects stdout as we only care about the exit code.
    const commandToCheck = isWindows
      ? `where "${command}" > nul 2> nul`
      : `which "${command}" > /dev/null 2> /dev/null`;

    execSync(commandToCheck);
    return true; // If execSync doesn't throw, the command was found (exit code 0)
  } catch (error) {
    // If the command is not found, execSync will throw an error (non-zero exit code)
    return false;
  }
}
