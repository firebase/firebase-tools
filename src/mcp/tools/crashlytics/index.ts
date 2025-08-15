import type { ServerTool } from "../../tool";
import { list_top_issues } from "./list_top_issues";
import { add_note } from "./add_note";
import { update_issue } from "./update_issue";

export const crashlyticsTools: ServerTool[] = [list_top_issues, add_note, update_issue];
