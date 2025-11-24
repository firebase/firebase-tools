import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import * as path from "path";
import * as os from "os";
import { InteractiveCLI, poll } from "./interactive-cli";
import { AgentTestRunner, AgentTestMatchers } from "./agent-test-runner";
import {
  ParsedToolLog,
  getToolName,
  toolArgumentsMatch,
  getToolArgumentsDebug,
} from "./tool-matcher";

import { throwFailure } from "./logging";
import { getAgentEvalsRoot, RunDirectories } from "./paths";
import { execSync } from "node:child_process";
import { ToolMockName } from "../mock/tool-mocks";
import { appendFileSync } from "node:fs";

const READY_PROMPT = "Type your message";
const INSTALL_ID = "238efa5b-efb2-44bd-9dce-9b081532681c";

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

interface CheckResult {
  success: boolean;
  messages: string[];
}

export class GeminiCliRunner implements AgentTestRunner {
  private readonly cli: InteractiveCLI;
  private readonly telemetryPath: string;
  private readonly telemetryTimeout = 15000;
  readonly runDir: string;
  private readonly userDir: string;

  // Determines which tools to start from for this turn so we don't detect tool
  // calls from previous turns
  private turnToolIndex = 0;

  constructor(
    private readonly testName: string,
    dirs: RunDirectories,
    toolMocks: ToolMockName[],
  ) {
    console.debug(`Creating telemetry log: ${dirs.testDir}/telemetry.log`);
    // Create a settings file to point the CLI to a local telemetry log
    this.telemetryPath = path.join(dirs.testDir, "telemetry.log");

    const mockPath = path.resolve(path.join(getAgentEvalsRoot(), "src/mock/mock-tools-main.js"));
    console.debug(`Providing mock path: ${mockPath}`);
    const firebasePath = execSync("which firebase").toString().trim();

    console.debug(`Initializing Gemini workspace settings in ${dirs.runDir}`);
    // Write workspace Gemini Settings
    this.writeGeminiSettings(dirs.runDir, {
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
    });

    console.debug(`Initializing Gemini user settings in ${dirs.userDir}`);
    // Write user Gemini Settings
    this.writeGeminiSettings(dirs.userDir, {
      security: {
        auth: {
          selectedType: "gemini-api-key",
        },
      },
      hasSeenIdeIntegrationNudge: true,
    });

    this.writeGeminiInstallId(dirs.userDir);

    this.runDir = dirs.runDir;
    this.userDir = dirs.userDir;
    this.cli = new InteractiveCLI("gemini", ["--yolo"], {
      cwd: dirs.runDir,
      readyPrompt: READY_PROMPT,
      showOutput: true,
      env: {
        // Overwrite $HOME so that we can support GCLI features that only apply
        // on a per-user basis, like memories and extensions
        HOME: dirs.userDir,
        NODE_ENV: "test",
      },
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

  async remember(text: string): Promise<void> {
    const geminiDir = path.join(this.userDir, ".gemini");
    const geminiMdFile = path.join(geminiDir, "GEMINI.md");
    if (!existsSync(geminiDir)) {
      mkdirSync(geminiDir, { recursive: true });
    }

    if (!existsSync(geminiMdFile)) {
      writeFileSync(geminiMdFile, "## Gemini Added Memories" + os.EOL);
    }

    appendFileSync(geminiMdFile, text + os.EOL);
    await this.type("/memory refresh");
    // Due to https://github.com/google-gemini/gemini-cli/issues/10702, we need to start a new chat
    await this.type("/clear");
  }

  async exit(): Promise<void> {
    await this.cli.kill();
  }

  writeGeminiSettings(dir: string, settings: any) {
    const geminiDir = path.join(dir, ".gemini");
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(path.join(geminiDir, "settings.json"), JSON.stringify(settings, null, 2));
  }

  /**
   * Writes a constant, real install ID so that we don't bump Gemini metrics
   * with fake users
   */
  writeGeminiInstallId(userDir: string) {
    const geminiDir = path.join(userDir, ".gemini");
    writeFileSync(path.join(geminiDir, "installation_id"), INSTALL_ID);
  }

  async expectText(text: string | RegExp): Promise<void> {
    return this.cli.expectText(text);
  }

  /**
   * Reads the agent's telemetry file and looks for the given event. Throws if
   * the event is not found
   */
  async expectToolCalls(tools: string[]): Promise<void> {
    await this.waitForTelemetryReady();
    let logs: string[] = [];
    const toolsCallsMade = await poll(() => {
      logs = [];
      const { success, messages } = this.checkToolCalls(tools);
      logs = [...messages];
      return success;
    }, this.telemetryTimeout);

    if (!toolsCallsMade) {
      throwFailure(logs.join("\n"));
    }
  }

  public async expectMemory(text: string | RegExp): Promise<void> {
    let logs: string[] = [];
    const memoryFound = await poll(() => {
      logs = [];
      const { success, messages } = this.checkMemory(text);
      logs = [...messages];
      return success;
    }, this.telemetryTimeout);

    if (!memoryFound) {
      throwFailure(logs.join("\n"));
    }
  }

  get dont(): AgentTestMatchers {
    return {
      expectText: async (text: string | RegExp) => {
        try {
          await this.cli.expectText(text);
        } catch (e) {
          return;
        }
        throwFailure(`Found text "${text}" in the output, but expected it to be absent.`);
      },
      expectToolCalls: async (tools: string[]) => {
        const timeout = 1000;
        const found = await poll(() => {
          const { success } = this.checkToolCalls(tools);
          return success;
        }, timeout);

        if (found) {
          throwFailure(
            `Found tool calls ${JSON.stringify(tools)} in the output, but expected them to be absent.`,
          );
        }
      },
      expectMemory: async (text: string | RegExp) => {
        const timeout = 1000;
        const found = await poll(() => {
          const { success } = this.checkMemory(text);
          return success;
        }, timeout);

        if (found) {
          throwFailure(
            `Found memory matching "${text}" in GEMINI.md, but expected it to be absent.`,
          );
        }
      },
    };
  }

  // Implementation for this is borrowed from the Gemini CLI's test-helper
  private async waitForTelemetryReady() {
    // Wait for telemetry file to exist and have content
    await poll(() => {
      if (!existsSync(this.telemetryPath)) return false;
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

  private readAndParseTelemetryLog(): ParsedTelemetryLog[] {
    const logFilePath = this.telemetryPath;
    if (!logFilePath || !existsSync(logFilePath)) {
      return [];
    }

    const content = readFileSync(logFilePath, "utf-8");

    // Split the content into individual JSON objects
    // They are separated by "}\n{"
    const jsonObjects = content
      .split(/}\n{/)
      .map((obj: string, index: number, array: string[]) => {
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

  private checkToolCalls(tools: string[]): CheckResult {
    const messages = [];
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
    return { success: allSucceeded, messages };
  }

  private checkMemory(text: string | RegExp): CheckResult {
    const geminiMdPath = path.join(this.userDir, ".gemini", "GEMINI.md");
    const messages: string[] = [];
    if (!existsSync(geminiMdPath)) {
      messages.push(`GEMINI.md file not found at ${geminiMdPath}`);
      return { success: false, messages };
    }
    const content = readFileSync(geminiMdPath, "utf-8");
    const found = content.match(text);
    if (!found) {
      messages.push(
        `Did not find expected memory entry containing "${text.toString()}" in ${geminiMdPath}. File content:\n${content}`,
      );
      return { success: false, messages };
    }
    return { success: true, messages };
  }
}
