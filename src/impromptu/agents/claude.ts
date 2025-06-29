import { BaseAgent } from "./base";
import { AgentOptions, AgentResult, ConversationTurn } from "../types";

/**
 * Claude Code SDK integration
 */
export class ClaudeAgent extends BaseAgent {
  constructor() {
    super("claude");
  }

  async run(
    prompt: string,
    workspaceDir: string,
    options?: AgentOptions
  ): Promise<AgentResult> {
    try {
      // Dynamically import the Claude Code SDK
      const { query } = await import("@anthropic-ai/claude-code");
      
      const messages: any[] = [];
      const conversationHistory: ConversationTurn[] = [];
      let lastResultMessage: any = null;
      
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = options?.timeout 
        ? setTimeout(() => abortController.abort(), options.timeout)
        : undefined;

      try {
        // Query Claude Code SDK
        const response = query({
          prompt,
          abortController,
          options: {
            maxTurns: 10, // Allow multiple turns for complex tasks
            cwd: workspaceDir, // Set working directory
            permissionMode: 'bypassPermissions', // Auto-accept all changes for automation
          },
        });
        
        // Collect messages
        for await (const message of response) {
          messages.push(message);
          
          // Track conversation turns
          if (message.type === "user") {
            conversationHistory.push({
              role: "user",
              content: message.message.content || "",
              timestamp: new Date(),
            });
          } else if (message.type === "assistant") {
            // Extract text content from assistant messages
            const textContent = message.message.content
              .filter((block: any) => block.type === "text")
              .map((block: any) => block.text)
              .join("\n");
              
            conversationHistory.push({
              role: "assistant", 
              content: textContent,
              timestamp: new Date(),
            });
          } else if (message.type === "result") {
            lastResultMessage = message;
          }
          
          this.logDebug(`Claude message: ${message.type}`);
        }
        
        // Clear timeout if set
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Check if the task was completed successfully
        const success = lastResultMessage?.subtype === "success";
        const error = lastResultMessage?.is_error 
          ? `Claude encountered an error: ${lastResultMessage.subtype}` 
          : undefined;
        
        return {
          success,
          output: lastResultMessage?.result || messages.map(m => JSON.stringify(m)).join("\n"),
          error,
          conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
        };
        
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        if (error instanceof Error && error.name === "AbortError") {
          return this.createResult(false, undefined, `Claude timed out after ${options?.timeout}ms`);
        }
        
        throw error;
      }
      
    } catch (error) {
      // Handle import errors
      if (error instanceof Error && error.message.includes("Cannot find module")) {
        return this.createResult(
          false,
          undefined,
          "Claude Code SDK not installed. Run: npm install @anthropic-ai/claude-code"
        );
      }
      
      // Check if it's an auth error
      if (error instanceof Error && error.message.includes("API key")) {
        return this.createResult(
          false,
          undefined,
          "Claude authentication failed. Please either:\n" +
          "1. Set ANTHROPIC_API_KEY environment variable, or\n" +
          "2. Run 'claude login' to authenticate via OAuth"
        );
      }
      
      return this.createErrorResult(error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to import the SDK
      await import("@anthropic-ai/claude-code");
      
      // The SDK is available - it will handle auth (API key or OAuth)
      return true;
    } catch {
      return false;
    }
  }
}