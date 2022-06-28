/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
  filePath: string
): string {
  const projectRoot = detectProjectRoot(options);
  if (!projectRoot) {
    throw new FirebaseError("Expected to be in a project directory, but none was found.", {
      exit: 2,
    });
  }
  return path.resolve(projectRoot, filePath);
}
