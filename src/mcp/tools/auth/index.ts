import { ServerTool } from "../../tool";
import { update_user } from "./update_user";
import { get_users } from "./get_users";
import { set_sms_region_policy } from "./set_sms_region_policy";

export const authTools: ServerTool[] = [get_users, update_user, set_sms_region_policy];
