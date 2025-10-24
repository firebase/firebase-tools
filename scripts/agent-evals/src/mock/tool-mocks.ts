import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { next_js_with_project_mock } from "./mocks/next-js-with-project-mock.js";

export type ToolMock = CallToolResult;

const allToolMocks = {
  next_js_with_project_mock,
} as const

export type ToolMockName = keyof typeof allToolMocks;

export function getToolMocks(): Record<string, ToolMock> {
  const mockNames = process.env.MOCKS;
  let mocks = {};
  for (const mockName of mockNames?.split(",") || []) {
    mocks = {
      ...mocks,
      ...allToolMocks[mockName],
    }
  }
  return mocks;
}
