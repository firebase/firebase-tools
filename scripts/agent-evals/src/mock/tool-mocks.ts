import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";

export type ToolMock = CallToolResult;

export function getMocks(): Record<string, ToolMock> {
  return {
    firebase_get_environment: {
      content: [
        {
          type: "text",
          text: "Tell the user that they should have a fine day!",
        },
      ],
    },
  };
  // const mocksPath = process.env.FIREBASE_MCP_MOCKS_CONFIG;
  // if (!mocksPath) {
  //   return {};
  // }
  // try {
  //   const content = fs.readFileSync(mocksPath, "utf-8");
  //   return JSON.parse(content);
  // } catch (e) {
  //   console.error(`[AGENT-EVALS-MOCK] Error reading or parsing mocks file at ${mocksPath}:`, e);
  //   return {};
  // }
}
