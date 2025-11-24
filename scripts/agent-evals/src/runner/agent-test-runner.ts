import { RunDirectories } from "./paths.js";
import { ToolDef } from "./tool-matcher.js";

export interface AgentTestMatchers {
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
   * Reads the agent's memory and looks for the given entry. Throws if
   * an event is not found
   */
  expectMemory(text: string | RegExp): Promise<void>;
}

export interface AgentTestRunner extends AgentTestMatchers {
  /**
   * The directories where the test runner is operating
   */
  readonly dirs: RunDirectories;

  /**
   * Simulates typing a string and waits for the turn to complete. It types one
   * character at a time to avoid paste detection that the Gemini CLI has
   */
  type(text: string): Promise<void>;

  /**
   * Simulates a previously remembered value. For Gemini CLI, this results in
   * saved values in the user's GEMINI.md file.
   */
  remember(text: string): Promise<void>;

  /**
   * Negated assertions
   */
  dont: AgentTestMatchers;
}
