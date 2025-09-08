import type { ServerTool } from "../../tool";
import { generate_operation } from "./generate_operation";
import { generate_schema } from "./generate_schema";
import { info } from "./info";
import { compile } from "./compile";
import { execute } from "./execute";

export const dataconnectTools: ServerTool[] = [
  compile,
  generate_schema,
  generate_operation,
  info,
  execute,
];
