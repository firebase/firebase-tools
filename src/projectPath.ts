"use strict";

import * as path from "path";
import * as detectProjectRoot from "./detectProjectRoot";

// export namespace projectPath {
export function resolveProjectPath(cwd: string, filePath: string): string {
  return path.resolve(detectProjectRoot(cwd), filePath);
}
// }
