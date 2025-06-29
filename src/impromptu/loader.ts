import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import {
  Prompt,
  Case,
  CaseConfig,
  LLMRubric,
  ImpromptuConfig,
} from "./types";

/**
 * Loads prompts and cases following Impromptu conventions
 */
export class PromptLoader {
  constructor(private rootDir: string) {}

  /**
   * Load configuration from impromptu.json
   */
  async loadConfig(): Promise<ImpromptuConfig> {
    const configPath = path.join(this.rootDir, "impromptu.json");
    
    if (await fs.pathExists(configPath)) {
      try {
        const content = await fs.readFile(configPath, "utf-8");
        return JSON.parse(content);
      } catch (error) {
        throw new FirebaseError(`Failed to parse impromptu.json: ${error}`);
      }
    }
    
    // Return default config if no config file exists
    return {
      agents: ["gemini", "claude"],
      defaultScorers: ["GoldenFileScorer", "BuildTestScorer"],
      prompts: {},
    };
  }

  /**
   * Discover and load all prompts
   */
  async loadAllPrompts(): Promise<Prompt[]> {
    const promptsDir = path.join(this.rootDir, "prompts");
    
    if (!await fs.pathExists(promptsDir)) {
      throw new FirebaseError(`Prompts directory not found: ${promptsDir}`);
    }
    
    const prompts: Prompt[] = [];
    const entries = await fs.readdir(promptsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const prompt = await this.loadPrompt(entry.name);
          prompts.push(prompt);
        } catch (error) {
          logger.warn(`Failed to load prompt ${entry.name}: ${error}`);
        }
      }
    }
    
    if (prompts.length === 0) {
      throw new FirebaseError("No valid prompts found");
    }
    
    return prompts;
  }

  /**
   * Load a specific prompt by ID
   */
  async loadPrompt(promptId: string): Promise<Prompt> {
    const promptDir = path.join(this.rootDir, "prompts", promptId);
    
    // Load required files
    const systemPrompt = await this.loadRequiredFile(promptDir, "system.md");
    const userPrompt = await this.loadRequiredFile(promptDir, "user.md");
    
    // Load optional rubric
    const rubric = await this.loadRubric(promptDir);
    
    // Load cases
    const cases = await this.loadCases(promptId);
    
    return {
      id: promptId,
      systemPrompt,
      userPrompt,
      rubric,
      cases,
    };
  }

  /**
   * Load all cases for a prompt
   */
  private async loadCases(promptId: string): Promise<Case[]> {
    const casesDir = path.join(this.rootDir, "prompts", promptId, "cases");
    
    // If no cases directory, create a default case
    if (!await fs.pathExists(casesDir)) {
      return [{
        id: "default",
        // No seed files, no expected files - just run the prompt
      }];
    }
    
    const cases: Case[] = [];
    const entries = await fs.readdir(casesDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const caseData = await this.loadCase(promptId, entry.name);
          cases.push(caseData);
        } catch (error) {
          logger.warn(`Failed to load case ${entry.name}: ${error}`);
        }
      }
    }
    
    if (cases.length === 0) {
      // If cases directory exists but is empty, create default case
      return [{
        id: "default",
      }];
    }
    
    return cases;
  }

  /**
   * Load a specific case
   */
  private async loadCase(promptId: string, caseId: string): Promise<Case> {
    const caseDir = path.join(this.rootDir, "prompts", promptId, "cases", caseId);
    
    // Load case configuration
    const config = await this.loadCaseConfig(caseDir);
    
    // Load seed files if present
    const seedFiles = await this.loadDirectoryFiles(path.join(caseDir, "seed"));
    
    // Load expected files and tests
    const expectedDir = path.join(caseDir, "expected");
    const { files: expectedFiles, tests: expectedTests } = await this.loadExpectedDirectory(expectedDir);
    
    return {
      id: caseId,
      seedFiles,
      expectedFiles,
      expectedTests,
      ...config,
    };
  }

  /**
   * Load case configuration from case.yaml
   */
  private async loadCaseConfig(caseDir: string): Promise<CaseConfig> {
    const configPath = path.join(caseDir, "case.yaml");
    
    if (!await fs.pathExists(configPath)) {
      return {};
    }
    
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = yaml.load(content) as CaseConfig;
      return config || {};
    } catch (error) {
      throw new FirebaseError(`Failed to parse case.yaml: ${error}`);
    }
  }

  /**
   * Load LLM rubric from llm_rubric.yaml
   */
  private async loadRubric(promptDir: string): Promise<LLMRubric | undefined> {
    const rubricPath = path.join(promptDir, "llm_rubric.yaml");
    
    if (!await fs.pathExists(rubricPath)) {
      return undefined;
    }
    
    try {
      const content = await fs.readFile(rubricPath, "utf-8");
      const rubric = yaml.load(content) as LLMRubric;
      
      // Validate rubric
      if (!rubric || !Array.isArray(rubric.criteria)) {
        throw new Error("Invalid rubric format: missing criteria array");
      }
      
      return rubric;
    } catch (error) {
      throw new FirebaseError(`Failed to parse llm_rubric.yaml: ${error}`);
    }
  }

  /**
   * Load expected directory, separating test files from other files
   */
  private async loadExpectedDirectory(expectedDir: string): Promise<{
    files?: Record<string, string>;
    tests?: string[];
  }> {
    if (!await fs.pathExists(expectedDir)) {
      throw new FirebaseError(`Expected directory not found: ${expectedDir}`);
    }
    
    const allFiles = await this.loadDirectoryFiles(expectedDir);
    const files: Record<string, string> = {};
    const tests: string[] = [];
    
    // Separate test files from other files
    for (const [filePath, content] of Object.entries(allFiles || {})) {
      if (this.isTestFile(filePath)) {
        tests.push(filePath);
      } else {
        files[filePath] = content;
      }
    }
    
    return {
      files: Object.keys(files).length > 0 ? files : undefined,
      tests: tests.length > 0 ? tests : undefined,
    };
  }

  /**
   * Check if a file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\.(js|ts|jsx|tsx)$/,
      /\.spec\.(js|ts|jsx|tsx)$/,
      /_test\.(py|go|dart)$/,
      /_test\.go$/,
      /test_.*\.py$/,
    ];
    
    return testPatterns.some(pattern => pattern.test(filePath));
  }

  /**
   * Load all files from a directory into a map
   */
  private async loadDirectoryFiles(dir: string): Promise<Record<string, string> | undefined> {
    if (!await fs.pathExists(dir)) {
      return undefined;
    }
    
    const files: Record<string, string> = {};
    
    async function walk(currentDir: string, baseDir: string): Promise<void> {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories
          if (!entry.name.startsWith(".")) {
            await walk(fullPath, baseDir);
          }
        } else if (entry.isFile()) {
          const relativePath = path.relative(baseDir, fullPath);
          const content = await fs.readFile(fullPath, "utf-8");
          files[relativePath] = content;
        }
      }
    }
    
    await walk(dir, dir);
    
    return Object.keys(files).length > 0 ? files : undefined;
  }

  /**
   * Load a required file, throwing if not found
   */
  private async loadRequiredFile(dir: string, filename: string): Promise<string> {
    const filePath = path.join(dir, filename);
    
    if (!await fs.pathExists(filePath)) {
      throw new FirebaseError(`Required file not found: ${filePath}`);
    }
    
    return fs.readFile(filePath, "utf-8");
  }
}