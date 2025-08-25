import type { ServerTool } from "../../tool";
import { add_note } from "./add_note";
import { delete_note } from "./delete_note";
import { get_issue_details } from "./get_issue_details";
import { get_sample_crash } from "./get_sample_crash";
import { list_notes } from "./list_notes";
import { list_top_devices } from "./list_top_devices";
import { list_top_issues } from "./list_top_issues";
import { list_top_operating_systems } from "./list_top_operating_systems";
import { list_top_versions } from "./list_top_versions";
import { update_issue } from "./update_issue";

export const crashlyticsTools: ServerTool[] = [
  add_note,
  delete_note,
  get_issue_details,
  get_sample_crash,
  list_notes,
  list_top_devices,
  list_top_issues,
  list_top_operating_systems,
  list_top_versions,
  update_issue,
];
