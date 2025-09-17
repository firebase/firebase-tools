import type { ServerTool } from "../../tool";
import { get_rules } from "./get_rules";
import { get_data } from "./get_data";
import { set_data } from "./set_data";
import { validate_rules } from "./validate_rules";

export const rtdbTools: ServerTool[] = [get_data, set_data, get_rules, validate_rules];
