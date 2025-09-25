import type { ServerTool } from "../../tool";

import { get_project } from "./get_project";
import { get_sdk_config } from "./get_sdk_config";
import { list_apps } from "./list_apps";
import { create_project } from "./create_project";
import { create_app } from "./create_app";
import { get_admin_sdk_config } from "./get_admin_sdk_config";
import { create_android_sha } from "./create_android_sha";
import { init } from "./init";
import { get_environment } from "./get_environment";
import { update_environment } from "./update_environment";
import { list_projects } from "./list_projects";
import { login } from "./login";
import { logout } from "./logout";
import { read_resources } from "./read_resources";

export const coreTools: ServerTool[] = [
  login,
  logout,
  get_project,
  list_apps,
  get_admin_sdk_config,
  list_projects,
  get_sdk_config,
  create_project,
  create_app,
  create_android_sha,
  get_environment,
  update_environment,
  init,
  read_resources,
];
