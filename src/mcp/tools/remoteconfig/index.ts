import { ServerTool } from "../../tool.js";
import { get_template } from "./get_template.js";
import { rollback_template } from "./rollback_template.js";
import { publish_template } from "./publish_template.js";

export const remoteConfigTools: ServerTool[] = [get_template, publish_template, rollback_template];
