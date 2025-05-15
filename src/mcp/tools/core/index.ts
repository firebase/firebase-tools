import type { ServerTool } from "../../tool.js";

import { consult_assistant } from "./consult_assistant.js";
import { get_project } from "./get_project.js";
import { get_sdk_config } from "./get_sdk_config.js";
import { list_apps } from "./list_apps.js";
import { init } from "./init.js";
import { get_environment } from "./get_environment.js";
import { update_environment } from "./update_environment.js";

export const coreTools: ServerTool[] = [
  get_project,
  list_apps,
  get_sdk_config,
  consult_assistant,
  get_environment,
  update_environment,
  init,
];
