import type { ServerPrompt } from "../../prompt";
import { generateRules } from "./generate_rules";

export const storagePrompts: ServerPrompt[] = [];

storagePrompts.push(generateRules);
