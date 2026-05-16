import { ServerTool } from "../../tool";
import { send_message } from "./send_message";
import { get_fcm_delivery_data } from "./get_delivery_data";

export const messagingTools: ServerTool[] = [send_message, get_fcm_delivery_data];
