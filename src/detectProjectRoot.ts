import { fileExistsSync } from "./fsutils";
import { dirname, resolve } from "path";

export function detectProjectRoot(cwd: string): string | null {
  let projectRootDir = cwd || process.cwd();
  while (!fileExistsSync(resolve(projectRootDir, "./firebase.json"))) {
    const parentDir = dirname(projectRootDir);
    if (parentDir === projectRootDir) {
      return null;
    }
    projectRootDir = parentDir;
  }
  return projectRootDir;
}
