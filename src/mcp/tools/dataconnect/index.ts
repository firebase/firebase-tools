import type { ServerTool } from "../../tool.js";
import { generate_operation } from "./generate_operation.js";
import { generate_schema } from "./generate_schema.js";

import { list_services } from "./list_services.js";
import { get_schema } from "./get_schema.js";
import { get_connector } from "./get_connector.js";

export const dataconnectTools: ServerTool[] = [
  list_services,
  generate_schema,
  generate_operation,
  get_schema,
  get_connector,
];
