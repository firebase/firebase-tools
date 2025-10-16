import type { ServerTool } from "../../tool";
import { check_test, run_tests } from "./tests";

export const apptestingTools: ServerTool[] = [run_tests, check_test];
