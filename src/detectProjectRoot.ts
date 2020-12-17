import { fileExistsSync } from "./fsutils";
import { FirebaseError } from "./error";
import { dirname, resolve } from "path";

export function detectProjectRoot(options: { cwd?: string; configPath?: string }): string | null {
  let projectRootDir = options.cwd || process.cwd();
  if (options.configPath) {
    const fullPath = resolve(projectRootDir, options.configPath);
    if (!fileExistsSync(fullPath)) {
      throw new FirebaseError(`Could not load config file ${options.configPath}.`, { exit: 1 });
    }

    return dirname(fullPath);
  }

  while (!fileExistsSync(resolve(projectRootDir, "./firebase.json"))) {
    const parentDir = dirname(projectRootDir);
    if (parentDir === projectRootDir) {
      return null;
    }
    projectRootDir = parentDir;
  }
  return projectRootDir;
}
