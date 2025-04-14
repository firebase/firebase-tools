import * as path from "path";
import { detectProjectRoot } from "./detectProjectRoot";
import { FirebaseError } from "./error";

/**
 * Returns a fully qualified path to the wanted file/directory inside the project.
 * @param options options object.
 * @param filePath the target file or directory in the project.
 * @return the fully resolved path within the project directory
 */
export function resolveProjectPath(
  options: { cwd?: string; configPath?: string },
  filePath: string,
): string {
  const projectRoot = detectProjectRoot(options);
  if (!projectRoot) {
    throw new FirebaseError("Expected to be in a project directory, but none was found.", {
      exit: 2,
    });
  }
  return path.resolve(projectRoot, filePath);
}
