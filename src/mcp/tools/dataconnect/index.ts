import type { ServerTool } from "../../tool";
import { list_services } from "./list_services";
import { compile } from "./compile";
import { execute_in_emulator } from "./execute";

export const dataconnectTools: ServerTool[] = [compile, list_services, execute_in_emulator];
