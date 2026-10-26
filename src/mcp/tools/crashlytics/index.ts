import type { ServerTool } from "../../tool";
import { create_note, list_notes, delete_note } from "./notes";
import { get_issue, update_issue } from "./issues";
import { list_events, batch_get_events } from "./events";
import { get_report } from "./reports";
import { onboard_web } from "./onboard_web";

export const crashlyticsTools: ServerTool[] = [
  create_note,
  delete_note,
  get_issue,
  list_events,
  batch_get_events,
  list_notes,
  get_report,
  update_issue,
  onboard_web,
];
