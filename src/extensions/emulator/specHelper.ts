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

export const DEFAULT_RUNTIME = "nodejs14";

/**
 * Get runtime associated with the resources. If multiple runtimes exists, choose the latest runtime.
 * e.g. prefer nodejs14 over nodejs12.
 */
export function getRuntime(resources: Resource[]): string {
  if (resources.length === 0) {
    return DEFAULT_RUNTIME;
  }

  const invalidRuntimes: string[] = [];
  const runtimes = resources.map((r: Resource) => {
    const runtime = getResourceRuntime(r);
    if (!runtime) {
      return DEFAULT_RUNTIME;
    }
    if (!/^(nodejs)?([0-9]+)/.test(runtime)) {
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
  // Rely on lexicographically order of nodejs runtime to pick the latest version.
  // e.g. nodejs12 < nodejs14 < nodejs18 < nodejs20 ...
  return runtimes.sort()[runtimes.length - 1];
}
