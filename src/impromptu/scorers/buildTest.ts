import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";
import { CommandDetector } from "../detector";
import { spawnSync } from "child_process";
import { logger } from "../../logger";

/**
 * Scorer that runs auto-detected build and test commands
 */
export class BuildTestScorer extends BaseScorer {
  private detector: CommandDetector;

  constructor() {
    super("BuildTestScorer");
    this.detector = new CommandDetector();
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    try {
      const { workspaceDir, caseConfig, timeout } = context;
      
      // Check if build command is overridden
      const buildCmd = caseConfig.buildCmd;
      
      let buildPassed = true;
      let testPassed = true;
      const details: any = {};
      
      // Run build command
      if (buildCmd) {
        // Use override build command
        this.logDebug(`Using override build command: ${buildCmd}`);
        const buildResult = this.runCommand(buildCmd, workspaceDir, timeout);
        buildPassed = buildResult.success;
        details.buildCommand = buildCmd;
        details.buildResult = buildResult;
      } else {
        // Auto-detect build command
        const buildDetection = await this.detector.detectBuildCommand(workspaceDir);
        if (buildDetection.detected) {
          this.logDebug(`Auto-detected build command: ${buildDetection.command} (${buildDetection.framework})`);
          const buildResult = this.runCommand(buildDetection.command!, workspaceDir, timeout);
          buildPassed = buildResult.success;
          details.buildCommand = buildDetection.command;
          details.buildFramework = buildDetection.framework;
          details.buildResult = buildResult;
        } else {
          this.logDebug("No build command detected");
          details.buildSkipped = true;
        }
      }
      
      // Auto-detect and run test command
      const testDetection = await this.detector.detectTestCommand(workspaceDir);
      if (testDetection.detected) {
        this.logDebug(`Auto-detected test command: ${testDetection.command} (${testDetection.framework})`);
        const testResult = this.runCommand(testDetection.command!, workspaceDir, timeout);
        testPassed = testResult.success;
        details.testCommand = testDetection.command;
        details.testFramework = testDetection.framework;
        details.testResult = testResult;
      } else {
        this.logDebug("No test command detected");
        details.testSkipped = true;
      }
      
      // Determine overall pass/fail
      const passed = buildPassed && testPassed;
      
      return this.createResult(passed, details);
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Run a command and return the result
   */
  private runCommand(
    command: string,
    cwd: string,
    timeoutMs: number
  ): { success: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string } {
    try {
      // Parse command into executable and args
      // Simple parsing - doesn't handle complex shell syntax
      const parts = command.split(" ");
      const executable = parts[0];
      const args = parts.slice(1);
      
      this.logDebug(`Running: ${command}`);
      
      const result = spawnSync(executable, args, {
        cwd,
        encoding: "utf-8",
        timeout: timeoutMs,
        shell: true, // Use shell to handle complex commands
        env: {
          ...process.env,
          CI: "true", // Set CI environment variable
          FORCE_COLOR: "0", // Disable color output
        },
      });
      
      if (result.error) {
        // Handle specific errors
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
      
      if (!success) {
        this.logDebug(`Command failed with exit code ${result.status}`);
        if (result.stderr) {
          this.logDebug(`stderr: ${result.stderr.substring(0, 500)}`);
        }
      }
      
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