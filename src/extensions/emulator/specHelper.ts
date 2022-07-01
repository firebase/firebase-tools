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

import * as yaml from "js-yaml";
import * as path from "path";
import * as fs from "fs-extra";

import { ExtensionSpec, Resource } from "../types";
import { FirebaseError } from "../../error";
import { substituteParams } from "../extensionsHelper";
import { parseRuntimeVersion } from "../../emulator/functionsEmulatorUtils";

const SPEC_FILE = "extension.yaml";
const POSTINSTALL_FILE = "POSTINSTALL.md";
const validFunctionTypes = [
  "firebaseextensions.v1beta.function",
  "firebaseextensions.v1beta.scheduledFunction",
];

/**
 * Wrapps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
function wrappedSafeLoad(source: string): any {
  try {
    return yaml.safeLoad(source);
  } catch (err: any) {
    if (err instanceof yaml.YAMLException) {
      throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
    }
    throw err;
  }
}

/**
 * Reads an extension.yaml and parses its contents into an ExtensionSpec.
 * @param directory the directory to look for a extensionYaml in.
 */
export async function readExtensionYaml(directory: string): Promise<ExtensionSpec> {
  const extensionYaml = await readFileFromDirectory(directory, SPEC_FILE);
  const source = extensionYaml.source;
  return wrappedSafeLoad(source);
}

/**
 * Reads a POSTINSTALL file and returns its content as a string
 * @param directory the directory to look for POSTINSTALL.md in.
 */
export async function readPostinstall(directory: string): Promise<string> {
  const content = await readFileFromDirectory(directory, POSTINSTALL_FILE);
  return content.source;
}

/**
 * Retrieves a file from the directory.
 */
export function readFileFromDirectory(
  directory: string,
  file: string
): Promise<{ source: string; sourceDirectory: string }> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path.resolve(directory, file), "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          return reject(
            new FirebaseError(`Could not find "${file}" in "${directory}"`, { original: err })
          );
        }
        reject(
          new FirebaseError(`Failed to read file "${file}" in "${directory}"`, { original: err })
        );
      } else {
        resolve(data);
      }
    });
  }).then((source) => {
    return {
      source,
      sourceDirectory: directory,
    };
  });
}

export function getFunctionResourcesWithParamSubstitution(
  extensionSpec: ExtensionSpec,
  params: { [key: string]: string }
): Resource[] {
  const rawResources = extensionSpec.resources.filter((resource) =>
    validFunctionTypes.includes(resource.type)
  );
  return substituteParams<Resource[]>(rawResources, params);
}

export function getFunctionProperties(resources: Resource[]) {
  return resources.map((r) => r.properties);
}

export function getNodeVersion(resources: Resource[]): number {
  const invalidRuntimes: string[] = [];
  const versions = resources.map((r: Resource) => {
    if (r.properties?.runtime) {
      const runtimeName = r.properties?.runtime as string;
      const runtime = parseRuntimeVersion(runtimeName);
      if (!runtime) {
        invalidRuntimes.push(runtimeName);
      } else {
        return runtime;
      }
    }
    return 14;
  });

  if (invalidRuntimes.length) {
    throw new FirebaseError(
      `The following runtimes are not supported by the Emulator Suite: ${invalidRuntimes.join(
        ", "
      )}. \n Only Node runtimes are supported.`
    );
  }
  return Math.max(...versions);
}
