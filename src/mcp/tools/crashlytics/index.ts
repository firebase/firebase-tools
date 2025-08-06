import type { ServerTool } from "../../tool";
import { list_top_issues } from "./list_top_issues";

export const crashlyticsTools: ServerTool[] = [list_top_issues];
