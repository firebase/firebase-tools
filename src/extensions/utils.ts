import * as _ from "lodash";
import { promptOnce } from "../prompt";
import { ParamOption } from "./extensionsApi";
import { RegistryEntry } from "./resolveSource";

// Modified version of the once function from prompt, to return as a joined string.
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

// Convert extension option to Inquirer-friendly list for the prompt, with all items unchecked.
export function convertExtensionOptionToLabeledList(options: ParamOption[]): ListItem[] {
  return options.map((option: ParamOption): ListItem => {
    return {
      checked: false,
      name: option.label,
      value: option.value,
    };
  });
}

// Convert map of RegistryEntry into Inquirer-friendly list for prompt, with all items unchecked.
export function convertOfficialExtensionsToList(officialExts: {
  [key: string]: RegistryEntry;
}): ListItem[] {
  const l = _.map(officialExts, (entry: RegistryEntry, key: string) => {
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
