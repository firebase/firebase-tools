import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { InteractiveCLI, poll } from "./interactive-cli.js";
import { AgentTestRunner } from "./agent-test-runner.js";

const READY_PROMPT = "Type your message";

export class GeminiCliRunner implements AgentTestRunner {
  private readonly cli: InteractiveCLI;
  private readonly telemetryPath;
  private readonly telemetryTimeout = 15000;

  constructor(private readonly testName: string) {
    // Create a unique, isolated directory for the test run
    const sanitizedName = testName.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const testDir = path.resolve(
      path.join("output", `${sanitizedName}-${randomBytes(8).toString("hex")}`),
    );
    const runDir = path.join(testDir, "repo");
    mkdirSync(runDir, { recursive: true });

    // Create a settings file to point the CLI to a local telemetry log
    this.telemetryPath = path.join(testDir, "telemetry.log");
    const settings = {
      general: {
        disableAutoUpdate: true,
      },
      telemetry: {
        enabled: true,
        target: "local",
        otlpEndpoint: "",
        outfile: this.telemetryPath,
      },
      mcpServers: {
        firebase: {
          command: path.resolve(runDir, '../../../../../lib/bin/firebase.js'),
          args: ["experimental:mcp"],
        },
      },
    };
    const geminiDir = path.join(runDir, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(path.join(geminiDir, "settings.json"), JSON.stringify(settings, null, 2));

    this.cli = new InteractiveCLI("gemini", ["--yolo"], {
      cwd: runDir,
      readyPrompt: READY_PROMPT,
      showOutput: true,
    });
  }

  async waitForReadyPrompt(): Promise<void> {
    return this.cli.waitForReadyPrompt();
  }

  async type(text: string): Promise<void> {
    return this.cli.type(text);
  }

  async expectText(text: string): Promise<void> {
    return this.cli.expectText(text);
  }

  async exit(): Promise<void> {
    await this.cli.kill();
  }

  /**
   * Reads the agent's telemetry file and looks for the given event. Throws if
   * the event is not found
   */
  async expectTelemetryEvent(eventName: string): Promise<void> {
    // NOTE: This doesn't take into account "turns" yet. It will likely look
    // through the entire history, not just the last turn
    const found = await poll(() => {
      if (!existsSync(this.telemetryPath)) {
        return false;
      }
      const content = readFileSync(this.telemetryPath, "utf-8");
      return content.includes(eventName);
    }, this.telemetryTimeout);

    if (!found) {
      throw new Error(`Did not find expected telemetry event: "${eventName}" in the telemetry log`);
    } else {
      console.log(`  [FOUND] expectTelemetryEvent: ${eventName}`);
    }
  }
}
