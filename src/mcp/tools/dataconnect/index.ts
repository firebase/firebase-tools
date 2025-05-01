import type { ServerTool } from "../../tool.js";
import { generate_dataconnect_operation } from "./generate_dataconnect_operation.js";
import { generate_dataconnect_schema } from "./generate_dataconnect_schema.js";

import { list_dataconnect_services } from "./list_dataconnect_services.js";

export const dataconnectTools: ServerTool[] = [
  list_dataconnect_services,
  generate_dataconnect_schema,
  generate_dataconnect_operation,
];
