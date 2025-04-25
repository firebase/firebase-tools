/* eslint camelcase: 0 */

import type { ServerTool } from "../../tool.js";

import { get_project } from "./get_project.js";
import { get_sdk_config } from "./get_sdk_config.js";
import { list_apps } from "./list_apps.js";

export const projectTools: ServerTool[] = [get_project, list_apps, get_sdk_config];
