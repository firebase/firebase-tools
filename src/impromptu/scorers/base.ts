import { Scorer, ScorerContext, ScorerResult } from "../types";
import { logger } from "../../logger";

/**
 * Base class for all scorers
 */
export abstract class BaseScorer implements Scorer {
  constructor(public readonly name: string) {}

  abstract score(context: ScorerContext): Promise<ScorerResult>;

  protected logDebug(message: string): void {
    logger.debug(`[${this.name}] ${message}`);
  }

  protected createResult(
    passed: boolean,
    details?: Record<string, any>,
    error?: string
  ): ScorerResult {
    return {
      name: this.name,
      passed,
      details,
      error,
    };
  }

  protected createErrorResult(error: Error | string): ScorerResult {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.createResult(false, undefined, errorMessage);
  }
}