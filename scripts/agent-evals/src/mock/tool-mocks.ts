import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
const { nextJsWithProjectMock } = require("./mocks/next-js-with-project-mock");
const {
  getEnvironmentWithIosApp,
  getEnvironmentWithAndroidApp,
  getEnvironmentWithFlutterApp,
} = require("./mocks/get-environment-mock");

export type ToolMock = CallToolResult;

const allToolMocks = {
  nextJsWithProjectMock,
  getEnvironmentWithIosApp,
  getEnvironmentWithAndroidApp,
  getEnvironmentWithFlutterApp,
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

module.exports = { getToolMocks };
