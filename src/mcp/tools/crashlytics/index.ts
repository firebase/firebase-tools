import type { ServerTool } from "../../tool.js";
import { fetch_issue_details } from "./fetch_issue_details.js";
import { list_top_issues } from "./list_top_issues.js";
import { get_sample_crash } from "./get_sample_crash.js";

export const crashlyticsTools: ServerTool[] = [
  list_top_issues,
  fetch_issue_details,
  get_sample_crash,
];
