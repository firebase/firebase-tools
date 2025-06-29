import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";
import { spawnSync } from "child_process";

/**
 * Scorer that runs custom commands specified in case.yaml
 */
export class CommandScorer extends BaseScorer {
  constructor() {
    super("CommandScorer");
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    try {
      const { workspaceDir, caseConfig, timeout } = context;
      
      // Skip if no commands
      if (!caseConfig.commands || caseConfig.commands.length === 0) {
        return this.createResult(true, { message: "No commands to run" });
      }
      
      const results: any[] = [];
      let allPassed = true;
      
      // Run each command
      for (const command of caseConfig.commands) {
        this.logDebug(`Running command: ${command}`);
        
        const result = this.runCommand(command, workspaceDir, timeout);
        results.push({
          command,
          success: result.success,
          exitCode: result.exitCode,
          stdout: result.stdout.substring(0, 500), // Limit output
          stderr: result.stderr.substring(0, 500),
          error: result.error,
        });
        
        if (!result.success) {
          allPassed = false;
          this.logDebug(`Command failed: ${command} (exit code: ${result.exitCode})`);
        }
      }
      
      return this.createResult(allPassed, {
        commandCount: caseConfig.commands.length,
        passedCount: results.filter(r => r.success).length,
        results,
      });
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Run a single command
   */
  private runCommand(
    command: string,
    cwd: string,
    timeoutMs: number
  ): { success: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string } {
    try {
      const result = spawnSync(command, [], {
        cwd,
        encoding: "utf-8",
        timeout: timeoutMs,
        shell: true, // Use shell to parse the command
        env: {
          ...process.env,
          CI: "true",
          FORCE_COLOR: "0",
        },
      });
      
      if (result.error) {
        if ((result.error as any).code === "ETIMEDOUT") {
          return {
            success: false,
            exitCode: null,
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            error: `Command timed out after ${timeoutMs}ms`,
          };
        }
        
        return {
          success: false,
          exitCode: result.status,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
          error: result.error.message,
        };
      }
      
      const success = result.status === 0;
      
      return {
        success,
        exitCode: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
      
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}