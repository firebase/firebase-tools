import { ServerTool } from "../../tool.js";
import { send_message_to_token } from "./send_message_to_token.js";

export const messagingTools: ServerTool[] = [send_message_to_token];