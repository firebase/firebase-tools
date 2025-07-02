import { AIToolModule } from "./types";
import { cursor } from "./cursor";
import { gemini } from "./gemini";
import { studio } from "./studio";

// Registry of all available AI tools
export const AI_TOOLS: Record<string, AIToolModule> = {
  cursor,
  gemini,
  studio,
};

// Export types for use in main ai-tools.ts
export * from "./types";