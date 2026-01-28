import { AIToolModule } from "./types";
import { cursor } from "./cursor";
import { gemini } from "./gemini";
import { studio } from "./studio";
import { claude } from "./claude";
import { antigravity } from "./antigravity";
import { codex } from "./codex";

export const AI_TOOLS: Record<string, AIToolModule> = {
  cursor,
  antigravity,
  codex,
  gemini,
  studio,
  claude,
};

export * from "./types";
