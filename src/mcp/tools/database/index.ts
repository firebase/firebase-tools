import type { ServerTool } from "../../tool";
import { get_data } from "./get_data";
import { set_data } from "./set_data";

export const realtimeDatabaseTools: ServerTool[] = [get_data, set_data];
