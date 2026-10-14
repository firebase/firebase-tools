import { ServerTool } from "../../tool";
import { get_template } from "./get_template";
import { update_template } from "./update_template";

export const remoteConfigTools: ServerTool[] = [get_template, update_template];
