import type { ServerTool } from "../../tool";
import { get_rules } from "../rtdb/get_rules";
import { validate_rules } from "../rtdb/validate_rules";
import { get_data } from "./get_data";
import { set_data } from "./set_data";

export const rtdbTools: ServerTool[] = [get_data, set_data, get_rules, validate_rules];
