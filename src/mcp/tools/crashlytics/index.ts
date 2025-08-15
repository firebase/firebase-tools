import type { ServerTool } from "../../tool";
import { get_issue_details } from "./get_issue_details";
import { list_top_issues } from "./list_top_issues";
import { get_sample_crash } from "./get_sample_crash";
import { add_note } from "./add_note";
import { update_issue } from "./update_issue";
import { list_top_versions } from "./list_top_versions";
import { list_top_devices } from "./list_top_devices";
import { list_top_operating_systems } from "./list_top_operating_systems";

export const crashlyticsTools: ServerTool[] = [
  add_note,
  list_top_issues,
  get_issue_details,
  get_sample_crash,
  update_issue,
  list_top_versions,
  list_top_devices,
  list_top_operating_systems,
];
