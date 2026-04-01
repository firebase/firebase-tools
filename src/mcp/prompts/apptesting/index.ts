import { isEnabled } from "../../../experiments";
import { runTest } from "./run_test";
import type { ServerPrompt } from "../../prompt";

export const apptestingPrompts: ServerPrompt[] = [];

if (isEnabled("mcpalpha")) {
  apptestingPrompts.push(runTest);
}
