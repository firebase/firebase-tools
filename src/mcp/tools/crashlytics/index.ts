import type { ServerTool } from "../../tool";
import { create_note, list_notes, delete_note } from "./notes";
import { get_issue, update_issue } from "./issues";
import { list_events, batch_get_events } from "./events";
import {
  get_top_issues,
  get_top_variants,
  get_top_versions,
  get_top_apple_devices,
  get_top_operating_systems,
  get_top_android_devices,
} from "./reports";

export const crashlyticsTools: ServerTool[] = [
  create_note,
  delete_note,
  get_issue,
  list_events,
  batch_get_events,
  list_notes,
  get_top_issues,
  get_top_variants,
  get_top_versions,
  get_top_apple_devices,
  get_top_android_devices,
  get_top_operating_systems,
  update_issue,
];
