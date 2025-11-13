import {
  ParamOption,
  Resource,
  FUNCTIONS_RESOURCE_TYPE,
  FUNCTIONS_V2_RESOURCE_TYPE,
} from "./types";
import { Runtime } from "../deploy/functions/runtimes/supported";
import { Choice } from "../prompt";

/**
 * Convert extension option to Inquirer-friendly list for the prompt, with all items unchecked.
 */
export function convertExtensionOptionToLabeledList(options: ParamOption[]): Choice<string>[] {
  return options.map((option: ParamOption): Choice<string> => {
    return {
      checked: false,
      name: option.label,
      value: option.value,
    };
  });
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
