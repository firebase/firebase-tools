import type { ServerTool } from "../../tool";
import { list_services } from "./list_services";
import { compile } from "./compile";

export const dataconnectTools: ServerTool[] = [compile, list_services];

