import { ServerTool } from "../../tool";
import { get_user } from "./get_user";
import { update_user } from "./update_user";
import { set_sms_region_policy } from "./set_sms_region_policy";
import { list_users } from "./list_users";

export const authTools: ServerTool[] = [get_user, update_user, list_users, set_sms_region_policy];
