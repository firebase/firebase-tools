import { ToolDef } from "./tool-matcher.js";

export interface AgentTestRunner {
  /**
   * Simulates typing a string and waits for the turn to complete. It types one
   * character at a time to avoid paste detection that the Gemini CLI has
   */
  type(text: string): Promise<void>;

  /**
   * Looks for a specific string or regex to in the agent's output since the
   * last time the user typed and pressed enter.
   * Throws an error if the text is not found within the timeout.
   */
  expectText(text: string | RegExp): Promise<void>;

  /**
   * Reads the agent's telemetry and looks for the given tool calls. Throws if
   * an event is not found
   */
  expectToolCalls(tools: ToolDef[]): Promise<void>;

  /**
   * Returns an assertion object for the path inside the run directory that can
   * be asserted on via chai-fs's API: https://www.chaijs.com/plugins/chai-fs/
   */
  expectFs(filePath: string): Chai.Assertion;
}
