import type { ServerTool } from "../../tool.js";
import { generate_operation } from "./generate_operation.js";
import { generate_schema } from "./generate_schema.js";

import { list_services } from "./list_services.js";
import { get_schema } from "./get_schema.js";
import { get_connector } from "./get_connector.js";
import { execute_graphql } from "./execute_graphql.js";
import { execute_graphql_read } from "./execute_graphql_read.js";
import { execute_query } from "./execute_query.js";
import { execute_mutation } from "./execute_mutation.js";

export const dataconnectTools: ServerTool[] = [
  list_services,
  generate_schema,
  generate_operation,
  get_schema,
  get_connector,
  execute_graphql,
  execute_graphql_read,
  execute_mutation,
  execute_query,
];
