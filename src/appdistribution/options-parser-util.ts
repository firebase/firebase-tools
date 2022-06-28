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
import { FirebaseError } from "../error";
import { needProjectNumber } from "../projectUtils";

/**
 * Takes in comma separated string or a path to a comma/new line separated file
 * and converts the input into an string[] of testers or groups. Value takes precedent
 * over file.
 */
export function getTestersOrGroups(value: string, file: string): string[] {
  // If there is no value then the file gets parsed into a string to be split
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  // The value is split into a string[]
  if (value) {
    return splitter(value);
  }
  return [];
}

/**
 * Takes in a string[] or a path to a comma/new line separated file of testers emails and
 * returns a string[] of emails.
 */
export function getEmails(emails: string[], file: string): string[] {
  if (emails.length === 0) {
    ensureFileExists(file);
    const readFile = fs.readFileSync(file, "utf8");
    return splitter(readFile);
  }
  return emails;
}

// Ensures a the file path that the user input is valid
export function ensureFileExists(file: string, message = ""): void {
  if (!fs.existsSync(file)) {
    throw new FirebaseError(`File ${file} does not exist: ${message}`);
  }
}

// Splits string by either comma or new line
function splitter(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => !!entry);
}
// Gets project name from project number
export async function getProjectName(options: any): Promise<string> {
  const projectNumber = await needProjectNumber(options);
  return `projects/${projectNumber}`;
}

// Gets app name from appId
export function getAppName(options: any): string {
  if (!options.app) {
    throw new FirebaseError("set the --app option to a valid Firebase app id and try again");
  }
  const appId = options.app;
  return `projects/${appId.split(":")[1]}/apps/${appId}`;
}
