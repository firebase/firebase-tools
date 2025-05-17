import { ServerTool } from "../../tool";
import { fetch_logs } from "./fetch_logs";

export const runTools: ServerTool[] = [fetch_logs];
