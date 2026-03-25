import { isEnabled } from "../../../experiments";
import type { ServerTool } from "../../tool";
import { check_status, run_tests } from "./tests";

export const apptestingTools: ServerTool[] = [];

if (isEnabled("mcpalpha")) {
  apptestingTools.push(...[run_tests, check_status]);
}
