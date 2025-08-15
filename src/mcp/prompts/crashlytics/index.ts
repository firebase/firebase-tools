import type { ServerPrompt } from "../../prompt";
import { fix_issue } from "./fix_issue";
import { prioritize_issues } from "./prioritize_top_issues";

export const crashlyticsPrompts: ServerPrompt[] = [fix_issue, prioritize_issues];
