import type { ServerTool } from "../../tool";
import { get_data } from "./get_data";
import { set_data } from "./set_data";

<<<<<<<< HEAD:src/mcp/tools/rtdb/index.ts
export const rtdbTools: ServerTool[] = [get_data, set_data, get_rules, validate_rules];
========
export const realtimeDatabaseTools: ServerTool[] = [get_data, set_data];
>>>>>>>> origin/master:src/mcp/tools/realtime_database/index.ts
