import type { ServerTool } from "../../tool";
import { generate_operation } from "./generate_operation";
import { generate_schema } from "./generate_schema";
import { list_services } from "./list_services";
import { get_schema } from "./get_schema";
import { get_connectors } from "./get_connector";
import { execute } from "./execute";

export const dataconnectTools: ServerTool[] = [
  list_services,
  generate_schema,
  generate_operation,
  get_schema,
  get_connectors,
  execute,
];
