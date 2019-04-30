import * as path from "path";
import * as detectProjectRoot from "./detectProjectRoot";

/**
 * Returns a fully qualified path to the wanted file/directory inside the project.
 * @param cwd current working directory.
 * @param filePath the target file or directory in the project.
 */
export function resolveProjectPath(cwd: string, filePath: string): string {
  return path.resolve(detectProjectRoot(cwd), filePath);
}
