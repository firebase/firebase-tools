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
  if (emails.length == 0) {
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
