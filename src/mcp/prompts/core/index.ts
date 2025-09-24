import { init } from "./init";
import { deploy } from "./deploy";
import { isEnabled } from "../../../experiments";
import { consult } from "./consult";

const corePrompts = [deploy, consult];
if (isEnabled("mcpalpha")) {
  corePrompts.push(init);
}

export { corePrompts };
