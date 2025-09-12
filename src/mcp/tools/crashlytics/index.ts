import type { ServerTool } from "../../tool";
import { add_note } from "./add_note";
import { delete_note } from "./delete_note";
import { get_issue_details } from "./get_issue_details";
import { get_sample_crash } from "./get_sample_crash";
import { list_notes } from "./list_notes";
import {
  get_top_issues,
  get_top_variants,
  get_top_versions,
  get_top_devices,
  get_top_operating_systems,
} from "./reports";
import { update_issue } from "./update_issue";

export const crashlyticsTools: ServerTool[] = [
  add_note,
  delete_note,
  get_issue_details,
  get_sample_crash,
  list_notes,
  get_top_issues,
  get_top_variants,
  get_top_versions,
  get_top_devices,
  get_top_operating_systems,
  update_issue,
];
