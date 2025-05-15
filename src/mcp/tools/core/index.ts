import type { ServerTool } from "../../tool.js";

import { consult_assistant } from "./consult_assistant.js";
import { get_project } from "./get_project.js";
import { use_project } from "./use_project.js";
import { get_sdk_config } from "./get_sdk_config.js";
import { list_apps } from "./list_apps.js";
import { create_app } from "./create_app.js";
import { get_admin_sdk_config } from "./get_admin_sdk_config.js";
import { create_android_sha } from "./create_android_sha.js";
import { init } from "./init.js";
// import { get_environment } from "./get_environment.js";

export const coreTools: ServerTool[] = [
  get_project,
  use_project,
  list_apps,
  get_admin_sdk_config,
  get_sdk_config,
  create_app,
  create_android_sha,
  consult_assistant,
  // get_environment, // leaving commented out for the moment
  init,
];
