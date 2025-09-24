import { ServerTool } from "../../tool";
import { get_users } from "./get_users";
import { disable_user } from "./disable_user";
import { set_claim } from "./set_claims";
import { set_sms_region_policy } from "./set_sms_region_policy";

export const authTools: ServerTool[] = [
  get_users,
  disable_user,
  set_claim,
  set_sms_region_policy,
];
