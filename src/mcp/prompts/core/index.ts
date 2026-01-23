import { init } from "./init";
import { deploy } from "./deploy";
import { importFromGithub } from "./import_from_github";

const corePrompts = [deploy, init, importFromGithub];

export { corePrompts };
