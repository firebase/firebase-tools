import type { ServerPrompt } from "../../prompt";
import { generateSecurityRules } from "./generate_security_rules";

export const firestorePrompts: ServerPrompt[] = [];

firestorePrompts.push(generateSecurityRules);
