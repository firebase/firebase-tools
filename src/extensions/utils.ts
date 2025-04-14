import { promptOnce } from "../prompt";
import {
  ParamOption,
  Resource,
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
} from "./types";
import { RegistryEntry } from "./resolveSource";
import { Runtime } from "../deploy/functions/runtimes/supported";

/**
 * Modified version of the once function from prompt, to return as a joined string.
 */
export async function onceWithJoin(question: any): Promise<string> {
  const response = await promptOnce(question);
  if (Array.isArray(response)) {
    return response.join(",");
  }
  return response;
}

interface ListItem {
  name?: string; // User friendly display name for the option
  value: string; // Value of the option
  checked: boolean; // Whether the option should be checked by default
}

/**
 * Convert extension option to Inquirer-friendly list for the prompt, with all items unchecked.
 */
export function convertExtensionOptionToLabeledList(options: ParamOption[]): ListItem[] {
  return options.map((option: ParamOption): ListItem => {
    return {
      checked: false,
      name: option.label,
      value: option.value,
    };
  });
}

/**
 * Convert map of RegistryEntry into Inquirer-friendly list for prompt, with all items unchecked.
 */
export function convertOfficialExtensionsToList(officialExts: {
  [key: string]: RegistryEntry;
}): ListItem[] {
  const l = Object.entries(officialExts).map(([key, entry]) => {
    return {
      checked: false,
      value: `${entry.publisher}/${key}`,
    };
  });
  l.sort((a, b) => a.value.localeCompare(b.value));
  return l;
}

/**
 * Generates a random string of lowercase letters and numbers
 * @param length The length of the string
 */
export function getRandomString(length: number): string {
  const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
  }
  return result;
}

/**
 * Formats a timestamp from the Extension backend into something more readable
 * @param timestamp with this format: 2020-05-11T03:45:13.583677Z
 * @return a timestamp with this format: 2020-05-11 T03:45:13
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp) {
    return "";
  }
  const withoutMs = timestamp.split(".")[0];
  return withoutMs.replace("T", " ");
}

/**
 * Returns the runtime for the resource. The resource may be v1 or v2 function,
 * etc, and this utility will do its best to identify the runtime specified for
 * this resource.
 */
export function getResourceRuntime(resource: Resource): Runtime | undefined {
  switch (resource.type) {
    case FUNCTIONS_RESOURCE_TYPE:
      return resource.properties?.runtime;
    case FUNCTIONS_V2_RESOURCE_TYPE:
      return resource.properties?.buildConfig?.runtime;
    default:
      return undefined;
  }
}
