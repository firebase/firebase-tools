import { ServerTool } from "../../tool.js";
import { send_message_to_fcm_token } from "./send_message_to_fcm_token.js";
import { send_message_to_fcm_topic } from "./send_message_to_fcm_topic.js";

export const messagingTools: ServerTool[] = [send_message_to_fcm_token, send_message_to_fcm_topic];
