import { Agent, AgentOptions, AgentResult } from "../types";
import { logger } from "../../logger";
import { FirebaseError } from "../../error";

/**
 * Base class for all agents
 */
export abstract class BaseAgent implements Agent {
  constructor(public readonly name: string) {}

  abstract run(
    prompt: string,
    workspaceDir: string,
    options?: AgentOptions
  ): Promise<AgentResult>;

  abstract isAvailable(): Promise<boolean>;

  protected logDebug(message: string): void {
    logger.debug(`[${this.name}] ${message}`);
  }

  protected createResult(
    success: boolean,
    output?: string,
    error?: string
  ): AgentResult {
    return {
      success,
      output,
      error,
    };
  }

  protected createErrorResult(error: Error | string): AgentResult {
    const errorMessage = error instanceof Error ? error.message : error;
    return this.createResult(false, undefined, errorMessage);
  }

  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new FirebaseError(`Agent timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }
}