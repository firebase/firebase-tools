import { ServerTool } from "../../tool";
import { fetch_logs } from "./fetch_logs";
import { list_backends } from "./list_backends";

export const appHostingTools: ServerTool[] = [fetch_logs, list_backends];
