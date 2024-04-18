import * as yaml from "yaml";
import * as path from "path";
import * as fs from "fs-extra";

import * as supported from "../../deploy/functions/runtimes/supported";
import { ExtensionSpec, Resource } from "../types";
import { FirebaseError } from "../../error";
import { substituteParams } from "../extensionsHelper";
import { getResourceRuntime } from "../utils";

const SPEC_FILE = "extension.yaml";
const POSTINSTALL_FILE = "POSTINSTALL.md";
const validFunctionTypes = [
  "firebaseextensions.v1beta.function",
  "firebaseextensions.v1beta.v2function",
  "firebaseextensions.v1beta.scheduledFunction",
];

/**
 * Wrapps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
function wrappedSafeLoad(source: string): any {
  try {
    return yaml.parse(source);
  } catch (err: any) {
    if (err instanceof yaml.YAMLParseError) {
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
  const spec = wrappedSafeLoad(source);
  // Ensure that any omitted array fields are initialized as empty arrays
  spec.params = spec.params ?? [];
  spec.systemParams = spec.systemParams ?? [];
  spec.resources = spec.resources ?? [];
  spec.apis = spec.apis ?? [];
  spec.roles = spec.roles ?? [];
  spec.externalServices = spec.externalServices ?? [];
  spec.events = spec.events ?? [];
  spec.lifecycleEvents = spec.lifecycleEvents ?? [];
  spec.contributors = spec.contributors ?? [];

  return spec;
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
  file: string,
): Promise<{ source: string; sourceDirectory: string }> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(path.resolve(directory, file), "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          return reject(
            new FirebaseError(`Could not find "${file}" in "${directory}"`, { original: err }),
          );
        }
        reject(
          new FirebaseError(`Failed to read file "${file}" in "${directory}"`, { original: err }),
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

/**
 * Substitue parameters of function resources in the extensions spec.
 */
export function getFunctionResourcesWithParamSubstitution(
  extensionSpec: ExtensionSpec,
  params: { [key: string]: string },
): Resource[] {
  const rawResources = extensionSpec.resources.filter((resource) =>
    validFunctionTypes.includes(resource.type),
  );
  return substituteParams<Resource[]>(rawResources, params);
}

/**
 * Get properties associated with the function resource.
 */
export function getFunctionProperties(resources: Resource[]) {
  return resources.map((r) => r.properties);
}

export const DEFAULT_RUNTIME: supported.Runtime = supported.latest("nodejs");

/**
 * Get runtime associated with the resources. If multiple runtimes exists, choose the latest runtime.
 * e.g. prefer nodejs14 over nodejs12.
 * N.B. (inlined): I'm not sure why this code always assumes nodejs. It seems to
 *   work though and nobody is complaining that they can't run the Python
 *   emulator so I'm not investigating why it works.
 */
export function getRuntime(resources: Resource[]): supported.Runtime {
  if (resources.length === 0) {
    return DEFAULT_RUNTIME;
  }

  const invalidRuntimes: string[] = [];
  const runtimes: supported.Runtime[] = resources.map((r: Resource) => {
    const runtime = getResourceRuntime(r);
    if (!runtime) {
      return DEFAULT_RUNTIME;
    }
    if (!supported.runtimeIsLanguage(runtime, "nodejs")) {
      invalidRuntimes.push(runtime);
      return DEFAULT_RUNTIME;
    }
    return runtime;
  });
  if (invalidRuntimes.length) {
    throw new FirebaseError(
      `The following runtimes are not supported by the Emulator Suite: ${invalidRuntimes.join(
        ", ",
      )}. \n Only Node runtimes are supported.`,
    );
  }
  // Assumes that all runtimes target the nodejs.
  return supported.latest("nodejs", runtimes);
}
