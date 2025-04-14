import * as path from "path";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as fsutils from "../../../../fsutils";

// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

/**
 * Asserts that functions source directory exists and source file is present.
 * @param data Object representing package.json file.
 * @param sourceDir Directory for the functions source.
 * @param projectDir Project directory.
 * @throws { FirebaseError } Functions source directory and source file must exist.
 */
function assertFunctionsSourcePresent(data: any, sourceDir: string, projectDir: string): void {
  const indexJsFile = path.join(sourceDir, data.main || "index.js");
  if (!fsutils.fileExistsSync(indexJsFile)) {
    const relativeMainPath = path.relative(projectDir, indexJsFile);
    const msg = `${relativeMainPath} does not exist, can't deploy Cloud Functions`;
    throw new FirebaseError(msg);
  }
}

/**
 * Validate contents of package.json to ensure main file is present.
 * @param sourceDirName Name of source directory.
 * @param sourceDir Relative path of source directory.
 * @param projectDir Relative path of project directory.
 * @param hasRuntimeConfigInConfig Whether the runtime was chosen in the `functions` section of firebase.json.
 * @throws { FirebaseError } Package.json must be present and valid.
 */
export function packageJsonIsValid(
  sourceDirName: string,
  sourceDir: string,
  projectDir: string,
): void {
  const packageJsonFile = path.join(sourceDir, "package.json");
  if (!fsutils.fileExistsSync(packageJsonFile)) {
    const msg = `No npm package found in functions source directory ${sourceDirName}.`;
    throw new FirebaseError(msg);
  }

  let data;
  try {
    data = cjson.load(packageJsonFile);
    logger.debug("> [functions] package.json contents:", JSON.stringify(data, null, 2));
    assertFunctionsSourcePresent(data, sourceDir, projectDir);
  } catch (e: any) {
    const msg = `There was an error reading ${sourceDirName}${path.sep}package.json:\n\n ${e.message}`;
    throw new FirebaseError(msg);
  }
}
