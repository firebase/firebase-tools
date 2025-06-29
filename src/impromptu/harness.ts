import * as path from "path";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import {
  HarnessOptions,
  Prompt,
  Case,
  CaseResult,
  Scorer,
  Agent,
  ScorerContext,
  ImpromptuConfig,
} from "./types";
import { WorkspaceManager } from "./workspace";
import { PromptLoader } from "./loader";
import { Reporter } from "./reporter";

// Import scorers
import { GoldenFileScorer } from "./scorers/goldenFile";
import { BuildTestScorer } from "./scorers/buildTest";
import { TestRunnerScorer } from "./scorers/testRunner";
import { CommandScorer } from "./scorers/command";
import { LLMJudgeScorer } from "./scorers/llmJudge";

// Import agents
import { ClaudeAgent } from "./agents/claude";
import { GeminiAgent } from "./agents/gemini";
import { MockAgent } from "./agents/mock";
import { SmartMockAgent } from "./agents/smartMock";

/**
 * Main harness for running Impromptu benchmarks
 */
export class Harness {
  private workspaceManager: WorkspaceManager;
  private promptLoader: PromptLoader;
  private reporter: Reporter;
  private config: ImpromptuConfig;
  private agents: Map<string, Agent> = new Map();
  private scorers: Map<string, new() => Scorer> = new Map();

  constructor(private rootDir: string, private options: HarnessOptions) {
    this.workspaceManager = new WorkspaceManager(options.workspaceDir);
    this.promptLoader = new PromptLoader(rootDir);
    this.reporter = new Reporter();
    this.config = {};
    
    // Register built-in scorers
    this.registerScorer("GoldenFileScorer", GoldenFileScorer);
    this.registerScorer("BuildTestScorer", BuildTestScorer);
    this.registerScorer("TestRunnerScorer", TestRunnerScorer);
    this.registerScorer("CommandScorer", CommandScorer);
    this.registerScorer("LLMJudgeScorer", LLMJudgeScorer);
    
    // Register built-in agents
    this.registerAgent(new ClaudeAgent());
    this.registerAgent(new GeminiAgent());
    this.registerAgent(new MockAgent());
    this.registerAgent(new SmartMockAgent());
  }

  /**
   * Register a scorer
   */
  registerScorer(name: string, scorerClass: new() => Scorer): void {
    this.scorers.set(name, scorerClass);
  }

  /**
   * Register an agent
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.name, agent);
  }

  /**
   * Run the benchmark
   */
  async run(): Promise<void> {
    try {
      // Load configuration
      this.config = await this.promptLoader.loadConfig();
      logger.info("Loaded Impromptu configuration");
      
      // Validate agents
      await this.validateAgents();
      
      // Load prompts
      const prompts = await this.promptLoader.loadAllPrompts();
      logger.info(`Found ${prompts.length} prompts`);
      
      // Filter prompts if specified
      const filteredPrompts = this.filterPrompts(prompts);
      
      // Run benchmarks
      for (const prompt of filteredPrompts) {
        await this.runPrompt(prompt);
      }
      
      // Display summary
      this.reporter.displaySummary();
      
      // Write results
      await this.reporter.writeResults(this.options.outputDir);
      
      // Cleanup old workspaces
      await this.workspaceManager.cleanupOldWorkspaces();
      
    } catch (error) {
      throw new FirebaseError(`Benchmark failed: ${error}`);
    }
  }

  /**
   * Validate that requested agents are available
   */
  private async validateAgents(): Promise<void> {
    const unavailable: string[] = [];
    
    for (const agentName of this.options.agents) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        throw new FirebaseError(`Unknown agent: ${agentName}`);
      }
      
      const available = await agent.isAvailable();
      if (!available) {
        unavailable.push(agentName);
      }
    }
    
    if (unavailable.length > 0) {
      throw new FirebaseError(
        `The following agents are not available: ${unavailable.join(", ")}. ` +
        `Please ensure they are installed and configured.`
      );
    }
  }

  /**
   * Filter prompts based on options
   */
  private filterPrompts(prompts: Prompt[]): Prompt[] {
    if (!this.options.filter) {
      return prompts;
    }
    
    const filterRegex = new RegExp(this.options.filter, "i");
    return prompts.filter(p => filterRegex.test(p.id));
  }

  /**
   * Run all cases for a prompt
   */
  private async runPrompt(prompt: Prompt): Promise<void> {
    logger.info(`Running prompt: ${prompt.id}`);
    
    for (const caseData of prompt.cases) {
      for (const agentName of this.options.agents) {
        await this.runCase(prompt, caseData, agentName);
      }
    }
  }

  /**
   * Run a single case with an agent
   */
  private async runCase(prompt: Prompt, caseData: Case, agentName: string): Promise<void> {
    const startTime = Date.now();
    this.reporter.logCaseStart(prompt.id, caseData.id, agentName);
    
    try {
      // Setup workspace
      const workspaceDir = await this.workspaceManager.setupWorkspace(prompt.id, caseData.id);
      
      // Copy seed files if present
      if (caseData.seedFiles) {
        await this.workspaceManager.copySeedFiles(workspaceDir, caseData.seedFiles);
      }
      
      // Take before snapshot
      const seedSnapshot = await this.workspaceManager.createSnapshot(workspaceDir);
      
      // Run agent
      const agent = this.agents.get(agentName)!;
      const fullPrompt = `${prompt.systemPrompt}\n\n${prompt.userPrompt}`;
      const timeout = caseData.timeout || this.config.prompts?.[prompt.id]?.timeout || 300000;
      
      const agentResult = await agent.run(fullPrompt, workspaceDir, { timeout });
      
      // Take after snapshot
      const afterSnapshot = await this.workspaceManager.createSnapshot(workspaceDir);
      
      // Run scorers
      const scorerResults = await this.runScorers(prompt, caseData, {
        caseId: caseData.id,
        workspaceDir,
        seedSnapshot,
        afterSnapshot,
        agentResult,
        caseConfig: caseData,
        timeout,
      });
      
      // Record result
      const result: CaseResult = {
        promptId: prompt.id,
        caseId: caseData.id,
        agent: agentName,
        status: agentResult.success ? "success" : "failure",
        duration: Date.now() - startTime,
        scorerResults,
        agentResult,
      };
      
      this.reporter.addResult(result);
      
      // Cleanup workspace
      await this.workspaceManager.cleanupWorkspace(workspaceDir);
      
    } catch (error) {
      const result: CaseResult = {
        promptId: prompt.id,
        caseId: caseData.id,
        agent: agentName,
        status: "error",
        duration: Date.now() - startTime,
        scorerResults: [],
        error: error instanceof Error ? error.message : String(error),
      };
      
      this.reporter.addResult(result);
    }
  }

  /**
   * Run all applicable scorers for a case
   */
  private async runScorers(
    prompt: Prompt,
    caseData: Case,
    context: ScorerContext
  ): Promise<any[]> {
    const scorerNames = this.determineScorerList(prompt, caseData);
    const results = [];
    
    for (const scorerName of scorerNames) {
      const ScorerClass = this.scorers.get(scorerName);
      if (!ScorerClass) {
        logger.warn(`Unknown scorer: ${scorerName}`);
        continue;
      }
      
      try {
        const scorer = new ScorerClass();
        const result = await scorer.score(context);
        results.push(result);
      } catch (error) {
        results.push({
          name: scorerName,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return results;
  }

  /**
   * Determine which scorers to run for a case
   */
  private determineScorerList(prompt: Prompt, caseData: Case): string[] {
    // Start with case-specific scorers if specified
    if (caseData.scorers) {
      return caseData.scorers;
    }
    
    // Build scorer list based on conventions
    const scorers: string[] = [];
    
    // Always include default scorers
    const defaultScorers = 
      this.config.prompts?.[prompt.id]?.defaultScorers ||
      this.config.defaultScorers ||
      ["GoldenFileScorer", "BuildTestScorer"];
    
    scorers.push(...defaultScorers);
    
    // Auto-add scorers based on file presence
    if (caseData.expectedFiles) {
      if (!scorers.includes("GoldenFileScorer")) {
        scorers.push("GoldenFileScorer");
      }
    }
    
    if (caseData.expectedTests) {
      if (!scorers.includes("TestRunnerScorer")) {
        scorers.push("TestRunnerScorer");
      }
    }
    
    if (caseData.commands) {
      if (!scorers.includes("CommandScorer")) {
        scorers.push("CommandScorer");
      }
    }
    
    if (prompt.rubric) {
      if (!scorers.includes("LLMJudgeScorer")) {
        scorers.push("LLMJudgeScorer");
      }
    }
    
    // Remove duplicates
    return [...new Set(scorers)];
  }
}