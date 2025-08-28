import type { ServerTool } from "../../tool";
import { generate_operation } from "./generate_operation";
import { generate_schema } from "./generate_schema";
import { list_services } from "./list_services";
import { get_schema } from "./get_schema";
import { get_connectors } from "./get_connector";
<<<<<<< HEAD
import { execute_graphql } from "./execute_graphql";
import { execute_graphql_read } from "./execute_graphql_read";
import { execute_query } from "./execute_query";
import { execute_mutation } from "./execute_mutation";
import { compile } from "./compile";
=======
import { execute } from "./execute";
>>>>>>> origin/feat/merge-dataconnect-execute-tools

export const dataconnectTools: ServerTool[] = [
  compile,
  list_services,
  generate_schema,
  generate_operation,
  get_schema,
  get_connectors,
  execute,
];
