import * as pty from "node-pty";
import { IPty } from "node-pty";
import stripAnsi from "strip-ansi";
import { throwFailure } from "./logging.js";

export async function poll(predicate: () => boolean, timeout: number): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export interface RunInteractiveOptions {
  cwd: string;
  // The message to wait for until the user can type again
  readyPrompt: string;
  showOutput?: boolean;
  env?: NodeJS.ProcessEnv;
}

export class InteractiveCLI {
  // Output from the agent since the last text was inputted
  private turnOutput = "";

  private readonly ptyProcess: IPty;
  private readonly timeout = 300_000;
  private readonly exitTimeout = 5_000;

  constructor(
    command: string,
    args: string[],
    private readonly options: RunInteractiveOptions,
  ) {
    this.ptyProcess = pty.spawn(command, args, {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
    });

    this.ptyProcess.onData((data) => {
      this.turnOutput += data;
      if (options.showOutput) {
        process.stdout.write(data);
      }
    });
  }

  /**
   * Should be called once at the beginning of tests
   */
  async waitForReadyPrompt(): Promise<void> {
    await this.waitForText(this.options.readyPrompt);
    await this.waitForTurnComplete();
  }

  /**
   * Simulates typing a string and waits for the turn to complete. It types one
   * character at a time to avoid paste detection that the Gemini CLI has
   */
  async type(text: string): Promise<void> {
    for (const char of text) {
      this.ptyProcess.write(char);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Clear the buffer so that text expectations only apply to this turn
    this.turnOutput = "";

    // Increases reliability. Sometimes the agent needs some time until it will
    // accept "enter". My hunch is this is due to the autocomplete menu for
    // slash commands needing time to appear / disappear
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Simulate pressing enter
    this.ptyProcess.write("\r");

    await this.waitForTurnComplete();
  }

  /**
   * Waits for a specific string or regex to appear in the agent's output.
   * Throws an error if the text is not found within the timeout.
   */
  private async waitForText(text: string | RegExp): Promise<void> {
    const found = await poll(() => {
      const cleanOutput = stripAnsi(this.turnOutput);
      if (typeof text === "string") {
        return cleanOutput.toLowerCase().includes(text.toLowerCase());
      }
      return text.test(cleanOutput);
    }, this.timeout);

    if (!found) {
      throwFailure(`Did not find expected text: "${text}" in output within ${this.timeout}ms`);
    }
  }

  /**
   * Waits for the turn to complete.
   * Throws an error if it doesn't complete within the timeout.
   */
  private async waitForTurnComplete(timeout: number = this.timeout): Promise<void> {
    // The Gemini CLI doesn't have a clear indicator that it's done with a turn
    // other than it just stops writing output. We detect this
    let lastOutput = "";
    let counter = 0;
    const repetitionsUntilComplete = 3;
    const stoppedChanging = await poll(() => {
      if (lastOutput === this.turnOutput) {
        counter += 1;
        return counter > repetitionsUntilComplete;
      }
      counter = 0;
      lastOutput = this.turnOutput;
      return false;
    }, timeout);

    if (!stoppedChanging) {
      throwFailure(`CLI did not stop changing output within ${timeout}ms`);
    }
  }

  /**
   * Looks for a specific string or regex to in the agent's output since the
   * last time the user typed and pressed enter.
   * Throws an error if the text is not found within the timeout.
   */
  async expectText(text: string | RegExp): Promise<void> {
    let found = false;
    const cleanOutput = stripAnsi(this.turnOutput);
    if (typeof text === "string") {
      found = cleanOutput.toLowerCase().includes(text.toLowerCase());
    } else {
      found = text.test(cleanOutput);
    }

    if (!found) {
      throwFailure(`Did not find expected text: "${text}" in the latest output`);
    } else {
      console.log(`  [FOUND] expectText: ${text}`);
    }
  }

  /** Kills the underlying terminal process and waits for it to exit. */
  async kill(): Promise<void> {
    await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(1), this.exitTimeout);
      this.ptyProcess.onExit(({ exitCode }) => {
        clearTimeout(timer);
        resolve(exitCode);
      });
    });

    // Restore cursor visibility
    process.stdout.write("\x1b[?25h");

    this.ptyProcess.kill();
  }
}
