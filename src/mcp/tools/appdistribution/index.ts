import type { ServerTool } from "../../tool";
import { run_tests } from "./tests";

export const appdistributionTools: ServerTool[] = [run_tests];
