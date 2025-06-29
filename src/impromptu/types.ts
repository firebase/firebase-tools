/**
 * Type definitions for Impromptu benchmark harness
 */

// Configuration types
export interface ImpromptuConfig {
  $schema?: string;
  agents?: string[];
  defaultScorers?: string[];
  prompts?: Record<string, PromptConfig>;
}

export interface PromptConfig {
  defaultScorers?: string[];
  timeout?: number;
}

// Prompt and case types
export interface Prompt {
  id: string;
  systemPrompt: string;
  userPrompt: string;
  rubric?: LLMRubric;
  cases: Case[];
}

export interface Case {
  id: string;
  seedFiles?: Record<string, string>;
  expectedFiles?: Record<string, string>;
  expectedTests?: string[];
  commands?: string[];
  buildCmd?: string;
  scorers?: string[];
  timeout?: number;
}

export interface CaseConfig {
  commands?: string[];
  buildCmd?: string;
  scorers?: string[];
  timeout?: number;
}

// LLM rubric types
export interface LLMRubric {
  criteria: RubricCriterion[];
  passThreshold?: number;
}

export interface RubricCriterion {
  id: string;
  question: string;
  type: "yes_no" | "scale";
  weight?: number;
}

// Agent types
export interface Agent {
  name: string;
  run(prompt: string, workspaceDir: string, options?: AgentOptions): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
}

export interface AgentOptions {
  timeout?: number;
  env?: Record<string, string>;
}

export interface AgentResult {
  success: boolean;
  output?: string;
  error?: string;
  conversationHistory?: ConversationTurn[];
}

export interface ConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Scorer types
export interface Scorer {
  name: string;
  score(context: ScorerContext): Promise<ScorerResult>;
}

export interface ScorerContext {
  caseId: string;
  workspaceDir: string;
  seedSnapshot: FileSnapshot;
  afterSnapshot: FileSnapshot;
  agentResult: AgentResult;
  caseConfig: Case;
  timeout: number;
}

export interface ScorerResult {
  name: string;
  passed: boolean;
  score?: number;
  details?: Record<string, any>;
  error?: string;
}

export interface FileSnapshot {
  files: Record<string, string>; // path -> SHA256
  tree: string; // tree structure hash
}

// Harness types
export interface HarnessOptions {
  agents: string[];
  outputDir: string;
  workspaceDir: string;
  parallel?: boolean;
  filter?: string;
}

export interface CaseResult {
  promptId: string;
  caseId: string;
  agent: string;
  status: "success" | "failure" | "timeout" | "error";
  duration: number;
  scorerResults: ScorerResult[];
  agentResult?: AgentResult;
  error?: string;
}

export interface BenchmarkReport {
  timestamp: Date;
  gitSha?: string;
  config: ImpromptuConfig;
  results: CaseResult[];
  summary: BenchmarkSummary;
}

export interface BenchmarkSummary {
  totalCases: number;
  byAgent: Record<string, AgentSummary>;
  byPrompt: Record<string, PromptSummary>;
  overallScore: number;
}

export interface AgentSummary {
  totalCases: number;
  passed: number;
  failed: number;
  errors: number;
  score: number;
}

export interface PromptSummary {
  totalCases: number;
  passed: number;
  failed: number;
  byAgent: Record<string, number>;
}

// Auto-detection types
export interface BuildDetectionResult {
  detected: boolean;
  command?: string;
  framework?: string;
  configFile?: string;
}

export interface TestDetectionResult {
  detected: boolean;
  command?: string;
  framework?: string;
  pattern?: string;
}