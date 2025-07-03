import { AIToolModule } from "./types";
import { cursor } from "./cursor";
import { gemini } from "./gemini";
import { studio } from "./studio";
import { claude } from "./claude";

// Registry of all available AI tools
export const AI_TOOLS: Record<string, AIToolModule> = {
  cursor,
  gemini,
  studio,
  claude,
};

// Export types for use in main ai-tools.ts
export * from "./types";
