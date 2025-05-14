import { ServerTool } from "../../tool.js";
import { get_rc_template } from "./get_template.js";
import { rollback_rc_template } from "./rollback_template.js";
import { publish_rc_template } from "./publish_template.js";

export const remoteConfigTools: ServerTool[] = [
  get_rc_template,
  publish_rc_template,
  rollback_rc_template,
];
