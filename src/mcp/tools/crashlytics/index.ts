import type { ServerTool } from "../../tool.js";
import { list_top_issues } from "./list_top_issues.js";

export const crashlyticsTools: ServerTool[] = [
  list_top_issues,
];
