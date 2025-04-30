import type { ServerTool } from "../../tool.js";

import { list_dataconnect_services } from "./list_dataconnect_services.js";

export const dataconnectTools: ServerTool[] = [list_dataconnect_services];
