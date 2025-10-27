import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { nextJsWithProjectMock } from "./mocks/next-js-with-project-mock.js";

export type ToolMock = CallToolResult;

const allToolMocks = {
  nextJsWithProjectMock,
} as const;

export type ToolMockName = keyof typeof allToolMocks;

function isToolMockName(name: string): name is ToolMockName {
  return name in allToolMocks;
}

export function getToolMocks(): Record<string, ToolMock> {
  const mockNames = process.env.TOOL_MOCKS;
  let mocks = {};
  for (const mockName of mockNames?.split(",") || []) {
    if (isToolMockName(mockName)) {
      mocks = {
        ...mocks,
        ...allToolMocks[mockName], // No more error!
      };
    } else {
      console.error(`Invalid mock name provided: "${mockName}"`);
    }
  }
  return mocks;
}
