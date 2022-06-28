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

import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";

import { fileExistsSync } from "../fsutils";
import { FirebaseError } from "../error";
import { ExtensionSpec } from "./types";
import { logger } from "../logger";

const EXTENSIONS_SPEC_FILE = "extension.yaml";
const EXTENSIONS_PREINSTALL_FILE = "PREINSTALL.md";

/**
 * Retrieves and parses an ExtensionSpec from a local directory
 * @param directory the directory to look for extension.yaml and PRESINSTALL.md in
 */
export async function getLocalExtensionSpec(directory: string): Promise<ExtensionSpec> {
  const spec = await parseYAML(readFile(path.resolve(directory, EXTENSIONS_SPEC_FILE)));
  try {
    const preinstall = readFile(path.resolve(directory, EXTENSIONS_PREINSTALL_FILE));
    spec.preinstallContent = preinstall;
  } catch (err: any) {
    logger.debug(`No PREINSTALL.md found in directory ${directory}.`);
  }
  return spec;
}

/**
 * Climbs directories loking for an extension.yaml file, and return the first
 * directory that contains one. Throws an error if none is found.
 * @param directory the directory to start from searching from.
 */
export function findExtensionYaml(directory: string): string {
  while (!fileExistsSync(path.resolve(directory, EXTENSIONS_SPEC_FILE))) {
    const parentDir = path.dirname(directory);
    if (parentDir === directory) {
      throw new FirebaseError(
        "Couldn't find an extension.yaml file. Check that you are in the root directory of your extension."
      );
    }
    directory = parentDir;
  }
  return directory;
}

/**
 * Retrieves a file from the directory.
 * @param directory the directory containing the file
 * @param file the name of the file
 */
export function readFile(pathToFile: string): string {
  try {
    return fs.readFileSync(pathToFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new FirebaseError(`Could not find "${pathToFile}""`, { original: err });
    }
    throw new FirebaseError(`Failed to read file at "${pathToFile}"`, { original: err });
  }
}

/**
 * Checks if an extension name is a local extension by checking if a directory exists at that location
 * @param extensionName an extension name to check
 */
export function isLocalExtension(extensionName: string): boolean {
  try {
    fs.readdirSync(extensionName);
  } catch (err: any) {
    return false;
  }
  return true;
}

/**
 * Wraps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 * @param source an unparsed YAML string
 */
function parseYAML(source: string): any {
  try {
    return yaml.safeLoad(source);
  } catch (err: any) {
    if (err instanceof yaml.YAMLException) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw new FirebaseError(err.message);
  }
}
