import type { ServerTool } from "../../tool";

import { get_logs } from "./get_logs";
import { list_functions } from "./list_functions";

export const functionsTools: ServerTool[] = [get_logs, list_functions];
