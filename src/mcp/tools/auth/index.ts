import { ServerTool } from "../../tool.js";
import { get_auth_user } from "./get_auth_user.js";
import { disable_auth_user } from "./disable_auth_user.js";
import { set_auth_claim } from "./set_auth_claims.js";
import { set_sms_region_policy } from "./set_sms_region_policy.js";

export const authTools: ServerTool[] = [
  get_auth_user,
  disable_auth_user,
  set_auth_claim,
  set_sms_region_policy,
];
