import { init } from "./init";
import { deploy } from "./deploy";
import { isEnabled } from "../../../experiments";

const corePrompts = [deploy, init];

export { corePrompts };
