import * as supported from "../../deploy/functions/runtimes/supported";
import { ExtensionSpec, Resource } from "../types";
import { FirebaseError } from "../../error";
import { substituteParams } from "../extensionsHelper";
import { getResourceRuntime } from "../utils";
import { readFileFromDirectory, wrappedSafeLoad } from "../../utils";

const SPEC_FILE = "extension.yaml";
const POSTINSTALL_FILE = "POSTINSTALL.md";
const validFunctionTypes = [
  "firebaseextensions.v1beta.function",
  "firebaseextensions.v1beta.v2function",
  "firebaseextensions.v1beta.scheduledFunction",
];

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
