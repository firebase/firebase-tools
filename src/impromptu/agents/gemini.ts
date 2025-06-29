import { spawn } from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import { BaseAgent } from "./base";
import { AgentOptions, AgentResult, ConversationTurn } from "../types";

/**
 * Gemini CLI wrapper
 */
export class GeminiAgent extends BaseAgent {
  constructor() {
    super("gemini");
  }

  async run(
    prompt: string,
    workspaceDir: string,
    options?: AgentOptions
  ): Promise<AgentResult> {
    try {
      // Build gemini command
      const args = [
        "-p", prompt,
        "-y", // YOLO mode to auto-accept actions
        "-a", // Include all files in context
      ];
      
      this.logDebug(`Running gemini in workspace: ${workspaceDir}`);
      
      // Run gemini CLI
      const result = await this.runGeminiCLI(args, options, workspaceDir);
      
      return result;
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if gemini CLI is available
      const { spawnSync } = await import("child_process");
      const result = spawnSync("gemini", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Run the Gemini CLI and capture output
   */
  private runGeminiCLI(args: string[], options: AgentOptions | undefined, workspaceDir: string): Promise<AgentResult> {
    return new Promise((resolve) => {
      const conversationHistory: ConversationTurn[] = [];
      let stdout = "";
      let stderr = "";
      
      const gemini = spawn("gemini", args, {
        cwd: workspaceDir, // Run in the workspace directory
        env: {
          ...process.env,
          ...options?.env,
        },
        timeout: options?.timeout,
      });
      
      // Capture stdout
      gemini.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Try to parse conversation turns from output
        // This is a simplified parser - real implementation would need
        // to handle Gemini's specific output format
        if (chunk.includes("User:") || chunk.includes("Assistant:")) {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("User:")) {
              conversationHistory.push({
                role: "user",
                content: line.substring(5).trim(),
                timestamp: new Date(),
              });
            } else if (line.startsWith("Assistant:")) {
              conversationHistory.push({
                role: "assistant",
                content: line.substring(10).trim(),
                timestamp: new Date(),
              });
            }
          }
        }
      });
      
      // Capture stderr
      gemini.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      
      // Handle completion
      gemini.on("close", (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout,
            conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
          });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: `Gemini exited with code ${code}. stderr: ${stderr}`,
          });
        }
      });
      
      // Handle errors
      gemini.on("error", (error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });
      
      // Handle timeout
      if (options?.timeout) {
        setTimeout(() => {
          gemini.kill();
          resolve({
            success: false,
            error: `Gemini timed out after ${options.timeout}ms`,
          });
        }, options.timeout);
      }
    });
  }
}