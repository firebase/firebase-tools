import type { ServerPrompt } from "../../prompt";
import { generateSecurityRules } from "./generate_security_rules";

export const storagePrompts: ServerPrompt[] = [];

storagePrompts.push(generateSecurityRules);
