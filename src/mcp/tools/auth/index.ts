import { ServerTool } from "../../tool";
import { get_user } from "./get_user";
import { disable_user } from "./disable_user";
import { set_claim } from "./set_claims";
import { set_sms_region_policy } from "./set_sms_region_policy";
import { list_users } from "./list_users";

export const authTools: ServerTool[] = [
  get_user,
  disable_user,
  list_users,
  set_claim,
  set_sms_region_policy,
];
