import * as fs from "fs-extra";
import * as path from "path";
import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";
import { CommandDetector } from "../detector";
import { spawnSync } from "child_process";

/**
 * Scorer that runs test files found in expected directory
 */
export class TestRunnerScorer extends BaseScorer {
  private detector: CommandDetector;

  constructor() {
    super("TestRunnerScorer");
    this.detector = new CommandDetector();
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    try {
      const { workspaceDir, caseConfig, timeout } = context;
      
      // Skip if no expected tests
      if (!caseConfig.expectedTests || caseConfig.expectedTests.length === 0) {
        return this.createResult(true, { message: "No expected tests to run" });
      }
      
      // Copy test files to workspace
      await this.copyTestFiles(workspaceDir, caseConfig);
      
      // Detect test command
      const testDetection = await this.detector.detectTestCommand(workspaceDir);
      if (!testDetection.detected) {
        return this.createResult(false, { error: "Could not detect test framework" });
      }
      
      this.logDebug(`Running tests with: ${testDetection.command} (${testDetection.framework})`);
      
      // Run tests
      const result = this.runTests(testDetection.command!, workspaceDir, timeout);
      
      return this.createResult(result.success, {
        framework: testDetection.framework,
        command: testDetection.command,
        exitCode: result.exitCode,
        stdout: result.stdout.substring(0, 1000), // Limit output size
        stderr: result.stderr.substring(0, 1000),
        error: result.error,
      });
      
    } catch (error) {
      return this.createErrorResult(error as Error);
    }
  }

  /**
   * Copy test files from case config to workspace
   */
  private async copyTestFiles(workspaceDir: string, caseConfig: any): Promise<void> {
    if (!caseConfig.expectedFiles) {
      return;
    }
    
    for (const testPath of caseConfig.expectedTests || []) {
      if (caseConfig.expectedFiles[testPath]) {
        const fullPath = path.join(workspaceDir, testPath);
        const dir = path.dirname(fullPath);
        
        await fs.ensureDir(dir);
        await fs.writeFile(fullPath, caseConfig.expectedFiles[testPath], "utf-8");
        
        this.logDebug(`Copied test file: ${testPath}`);
      }
    }
  }

  /**
   * Run tests and return the result
   */
  private runTests(
    command: string,
    cwd: string,
    timeoutMs: number
  ): { success: boolean; exitCode: number | null; stdout: string; stderr: string; error?: string } {
    try {
      // Parse command
      const parts = command.split(" ");
      const executable = parts[0];
      const args = parts.slice(1);
      
      const result = spawnSync(executable, args, {
        cwd,
        encoding: "utf-8",
        timeout: timeoutMs,
        shell: true,
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
            error: `Tests timed out after ${timeoutMs}ms`,
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