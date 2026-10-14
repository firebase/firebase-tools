import { AIToolModule } from "./types";
import { cursor } from "./cursor";
import { gemini } from "./gemini";
import { studio } from "./studio";
import { claude } from "./claude";

export const AI_TOOLS: Record<string, AIToolModule> = {
  cursor,
  gemini,
  studio,
  claude,
};

export * from "./types";
