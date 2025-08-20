import type { ServerTool } from "../../tool";
import { get_issue_details } from "./get_issue_details";
import { list_top_issues } from "./list_top_issues";
import { get_sample_crash } from "./get_sample_crash";

export const crashlyticsTools: ServerTool[] = [
  list_top_issues,
  get_issue_details,
  get_sample_crash,
];
