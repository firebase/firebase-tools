import { isEnabled } from "../../../experiments";
import { schema } from "./schema";
import type { ServerPrompt } from "../../prompt";

export const dataconnectPrompts: ServerPrompt[] = [];

if (isEnabled("mcpalpha")) {
  dataconnectPrompts.push(schema);
}
