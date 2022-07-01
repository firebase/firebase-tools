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

import { promptOnce } from "../prompt";
import { ParamOption } from "./types";
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
