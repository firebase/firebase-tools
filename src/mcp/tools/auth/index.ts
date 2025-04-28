/* eslint camelcase: 0 */

import { ServerTool } from "../../tool.js";
import { get_auth_user } from "./get_auth_user.js";

export const authTools: ServerTool[] = [get_auth_user];
