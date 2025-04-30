import { ServerTool } from "../../tool.js";
import { get_auth_user } from "./get_auth_user.js";
import { disable_auth_user } from "./disable_auth_user.js";

export const authTools: ServerTool[] = [get_auth_user, disable_auth_user];
