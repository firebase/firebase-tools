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
   * Reads the agent's telemetry file and looks for the given event. Throws if
   * the event is not found
   */
  expectTelemetryEvent(eventName: string): Promise<void>;
}
