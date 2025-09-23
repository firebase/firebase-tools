import { init } from "./init";
import { deploy } from "./deploy";
import { isEnabled } from "../../../experiments";

const corePrompts = [deploy];
if (isEnabled("mcpalpha")) {
  corePrompts.push(init);
}

export { corePrompts };
