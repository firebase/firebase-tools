import { ServerTool } from "../../tool";
import { get_template } from "./get_template";
import { rollback_template } from "./rollback_template";
import { publish_template } from "./publish_template";

export const remoteConfigTools: ServerTool[] = [get_template, publish_template, rollback_template];
