import { ServerTool } from "../../tool.js";
import { list_functions } from "./list_functions.js";
import { list_supported_runtimes } from "./list_supported_runtimes.js";

export const functionsTools: ServerTool[] = [list_functions, list_supported_runtimes];
