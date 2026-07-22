import { ToolMock } from "./tool-mocks.js";

export function toMockContent(data: any): ToolMock {
  return { content: [{ type: "text", text: data }] };
}
