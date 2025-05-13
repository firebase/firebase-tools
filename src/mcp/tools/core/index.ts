import type { ServerTool } from "../../tool.js";

import { consult_assistant } from "./consult_assistant.js";
import { get_project } from "./get_project.js";
import { use_project } from "./use_project.js";
import { get_sdk_config } from "./get_sdk_config.js";
import { list_apps } from "./list_apps.js";
import { create_ios_app } from "./create_ios_app.js";
import { create_android_app } from "./create_android_app.js";
import { create_web_app } from "./create_web_app.js";
import { get_admin_sdk_config } from "./get_admin_sdk_config.js";
import { create_android_sha } from "./create_android_sha.js";
import { init } from "./init.js";

export const coreTools: ServerTool[] = [
  get_project,
  use_project,
  list_apps,
  get_admin_sdk_config,
  get_sdk_config,
  create_ios_app,
  create_android_app,
  create_web_app,
  create_android_sha,
  consult_assistant,
  init,
];
