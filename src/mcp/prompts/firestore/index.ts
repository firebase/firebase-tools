import type { ServerPrompt } from "../../prompt";
import { generateRules } from "./generate_rules";

export const firestorePrompts: ServerPrompt[] = [];

firestorePrompts.push(generateRules);
