import { ServerTool } from "../../tool.js";
import { get_user } from "./get_user.js";
import { disable_user } from "./disable_user.js";
import { set_claim } from "./set_claims.js";
import { set_sms_region_policy } from "./set_sms_region_policy.js";
import { list_users } from "./list_users.js";

export const authTools: ServerTool[] = [
  get_user,
  disable_user,
  list_users,
  set_claim,
  set_sms_region_policy,
];
