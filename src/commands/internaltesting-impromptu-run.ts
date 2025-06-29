import { Command } from "../command";
import { Options } from "../options";
import { FirebaseError } from "../error";
import { assertEnabled } from "../experiments";
import { logger } from "../logger";
import { logBullet } from "../utils";
import * as clc from "colorette";
import * as path from "path";
import * as fs from "fs-extra";
import { Harness } from "../impromptu/harness";

export const command = new Command("internaltesting:impromptu:run")
  .description("run Impromptu benchmark harness for AI agent evaluation")
  .option("-p, --path <path>", "path to prompts directory (default: ./prompts)")
  .option("-a, --agents <agents>", "comma-separated list of agents to test (default: gemini,claude)")
  .option("-o, --output <path>", "output directory for results (default: ./impromptu-results)")
  .option("-w, --workspace <path>", "workspace directory for agent operations (default: ./.impromptu-workspace)")
  .option("--timeout <ms>", "timeout for each case in milliseconds", "300000")
  .option("-f, --filter <pattern>", "regex pattern to filter prompts by ID")
  .option("--parallel", "run agents in parallel (experimental)")
  .before(() => {
    assertEnabled("internaltesting", "run Impromptu benchmarks");
  })
  .action(async (options: Options) => {
    const promptsPath = (options.path as string) || "./prompts";
    const agentList = ((options.agents as string) || "gemini,claude").split(",").map((a: string) => a.trim());
    const outputDir = (options.output as string) || "./impromptu-results";
    const workspaceDir = (options.workspace as string) || "./.impromptu-workspace";
    const timeout = parseInt((options.timeout as string) || "300000", 10);
    const filter = options.filter as string | undefined;
    const parallel = !!options.parallel;
    
    // Validate prompts directory exists
    if (!await fs.pathExists(promptsPath)) {
      throw new FirebaseError(
        `Prompts directory not found: ${promptsPath}\n` +
        `Please create a 'prompts' directory with your benchmark cases.`
      );
    }
    
    // Get the root directory (parent of prompts)
    const rootDir = path.dirname(promptsPath);
    
    logBullet(
      `${clc.bold(clc.cyan("impromptu:"))} Starting benchmark run\n` +
      `  Prompts: ${promptsPath}\n` +
      `  Agents: ${agentList.join(", ")}\n` +
      `  Output: ${outputDir}\n` +
      `  Workspace: ${workspaceDir}\n` +
      `  Timeout: ${timeout}ms per case`
    );
    
    if (filter) {
      logger.info(`  Filter: ${filter}`);
    }
    
    try {
      // Create harness
      const harness = new Harness(rootDir, {
        agents: agentList,
        outputDir,
        workspaceDir,
        parallel,
        filter,
      });
      
      // Run benchmarks
      await harness.run();
      
      logBullet(`${clc.bold(clc.green("✓"))} Benchmark completed successfully`);
      
    } catch (error) {
      if (error instanceof FirebaseError) {
        throw error;
      }
      throw new FirebaseError(`Benchmark failed: ${error}`);
    }
  });