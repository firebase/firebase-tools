import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { InteractiveCLI, poll } from "./interactive-cli.js";
import { AgentTestRunner } from "./agent-test-runner.js";
import {
  ParsedToolLog,
  getToolName,
  toolArgumentsMatch,
  getToolArgumentsDebug,
} from "./tool-matcher.js";
import fs from "fs";
import { throwFailure } from "./logging.js";
import { getAgentEvalsRoot } from "./paths.js";
import { execSync } from "node:child_process";
import { ToolMockName } from "../mock/tool-mocks.js";

const READY_PROMPT = "Type your message";

interface ParsedTelemetryLog {
  attributes?: {
    "event.name"?: string;
    function_name?: string;
    function_args?: string;
    success?: boolean;
    duration_ms?: number;
  };
  scopeMetrics?: {
    metrics: {
      descriptor: {
        name: string;
      };
    }[];
  }[];
}

export class GeminiCliRunner implements AgentTestRunner {
  private readonly cli: InteractiveCLI;
  private readonly telemetryPath: string;
  private readonly telemetryTimeout = 15000;

  // Determines which tools to start from for this turn so we don't detect tool
  // calls from previous turns
  private turnToolIndex = 0;

  constructor(
    private readonly testName: string,
    testDir: string,
    runDir: string,
    toolMocks: ToolMockName[],
  ) {
    // Create a settings file to point the CLI to a local telemetry log
    this.telemetryPath = path.join(testDir, "telemetry.log");
    const mockPath = path.resolve(path.join(getAgentEvalsRoot(), "lib/mock/mock-tools-main.js"));
    const firebasePath = execSync("which firebase").toString().trim();
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
          command: "node",
          args: ["--import", mockPath, firebasePath, "experimental:mcp"],
          env: {
            TOOL_MOCKS: `${toolMocks?.join(",") || ""}`,
          },
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
    const toolLogs = this.readToolLogs();
    this.turnToolIndex = toolLogs.length;
    return this.cli.type(text);
  }

  async expectText(text: string | RegExp): Promise<void> {
    return this.cli.expectText(text);
  }

  async exit(): Promise<void> {
    await this.cli.kill();
  }

  /**
   * Reads the agent's telemetry file and looks for the given event. Throws if
   * the event is not found
   */
  async expectToolCalls(tools: string[]): Promise<void> {
    await this.waitForTelemetryReady();

    // We still need to poll because telemetry can take time to write each turn
    let messages: string[] = [];
    const success = await poll(() => {
      messages = [];
      let allSucceeded = true;
      // Start at this.turnToolIndex so we only read the tools used this turn
      const toolLogs = this.readToolLogs().slice(this.turnToolIndex);
      const foundToolNames = toolLogs.map((log) => log.name);
      for (const toolDef of tools) {
        const toolName = getToolName(toolDef);
        const matchingTool = toolLogs.find((log) => log.name === toolName);
        if (!matchingTool) {
          messages.push(
            `Did not find expected tool call: "${toolName}" in the telemetry log. Found [${foundToolNames}]`,
          );
          allSucceeded = false;
        } else {
          const foundMatchingArguments = toolLogs.some(
            (log) => log.name === toolName && toolArgumentsMatch(toolDef, log),
          );
          if (!foundMatchingArguments) {
            messages.push(
              `Tool arguments matcher "${getToolArgumentsDebug(toolDef)}" for "${toolName}" did not match any tool results in the telemetry log. All tools are: [${JSON.stringify(toolLogs)}]`,
            );
            allSucceeded = false;
          }
        }
      }
      return allSucceeded;
    }, this.telemetryTimeout);

    if (!success) {
      throwFailure(messages.join("\n"));
    }
  }

  // Implementation for this is borrowed from the Gemini CLI's test-helper
  private async waitForTelemetryReady() {
    // Wait for telemetry file to exist and have content
    await poll(() => {
      if (!fs.existsSync(this.telemetryPath)) return false;
      try {
        const content = readFileSync(this.telemetryPath, "utf-8");
        // Check if file has at lease one event in it
        return content.includes('"event.name"');
      } catch {
        return false;
      }
    }, this.telemetryTimeout);
  }

  // Implementation for this is borrowed from the Gemini CLI's test-helper
  private readToolLogs(): ParsedToolLog[] {
    const parsedLogs = this.readAndParseTelemetryLog();
    const logs: ParsedToolLog[] = [];

    for (const logData of parsedLogs) {
      // Look for tool call logs
      if (
        logData.attributes?.function_name &&
        logData.attributes["event.name"] === "gemini_cli.tool_call"
      ) {
        logs.push({
          name: logData.attributes.function_name,
          args: logData.attributes.function_args ?? "{}",
          success: logData.attributes.success ?? false,
          duration_ms: logData.attributes.duration_ms ?? 0,
        });
      }
    }

    return logs;
  }

  // Implementation for this is borrowed from the Gemini CLI's test-helper
  private readAndParseTelemetryLog(): ParsedTelemetryLog[] {
    const logFilePath = this.telemetryPath;
    if (!logFilePath || !fs.existsSync(logFilePath)) {
      return [];
    }

    const content = readFileSync(logFilePath, "utf-8");

    // Split the content into individual JSON objects
    // They are separated by "}\n{"
    const jsonObjects = content
      .split(/}\n{/)
      .map((obj, index, array) => {
        // Add back the braces we removed during split
        if (index > 0) obj = "{" + obj;
        if (index < array.length - 1) obj = obj + "}";
        return obj.trim();
      })
      .filter((obj) => obj);

    const logs: ParsedTelemetryLog[] = [];

    for (const jsonStr of jsonObjects) {
      try {
        const logData = JSON.parse(jsonStr);
        logs.push(logData);
      } catch (e) {
        // Skip objects that aren't valid JSON
      }
    }

    return logs;
  }
}
