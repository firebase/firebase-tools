import type { ServerTool } from "../../tool.js";
import { generate_dataconnect_schema } from "./generate_dataconnect_schema.js";

import { get_dataconnect_service } from "./get_dataconnect_services.js";
import { get_dataconnect_schema } from "./get_dataconnect_schema.js";
import { get_dataconnect_connector } from "./get_dataconnect_connector.js";

export const dataconnectTools: ServerTool[] = [
  get_dataconnect_service,
  generate_dataconnect_schema,
  get_dataconnect_schema,
  get_dataconnect_connector,
];
