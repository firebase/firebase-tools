import { BaseScorer } from "./base";
import { ScorerContext, ScorerResult } from "../types";

/**
 * Scorer that uses an LLM to judge outputs based on a rubric
 * (Stub implementation for MVP)
 */
export class LLMJudgeScorer extends BaseScorer {
  constructor() {
    super("LLMJudgeScorer");
  }

  async score(context: ScorerContext): Promise<ScorerResult> {
    // TODO: Implement LLM-based scoring
    // This would:
    // 1. Load the rubric from the prompt config
    // 2. Prepare a prompt with the workspace changes and rubric questions
    // 3. Call an LLM API (e.g., OpenAI, Anthropic)
    // 4. Parse the response and calculate scores
    
    this.logDebug("LLMJudgeScorer not yet implemented");
    
    return this.createResult(true, {
      message: "LLM judge scoring not yet implemented",
      stub: true,
    });
  }
}