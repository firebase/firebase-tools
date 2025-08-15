import type { ServerTool } from "../../tool";
import { list_top_issues } from "./list_top_issues";
import { add_note } from "./add_note";
import { update_issue } from "./update_issue";
import { list_top_versions } from "./list_top_versions";
import { list_top_devices } from "./list_top_devices";
import { list_top_operating_systems } from "./list_top_operating_systems";

export const crashlyticsTools: ServerTool[] = [
  list_top_issues,
  add_note,
  update_issue,
  list_top_versions,
  list_top_devices,
  list_top_operating_systems,
];
