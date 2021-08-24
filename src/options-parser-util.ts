import * as fs from 'fs-extra';
import {FirebaseError} from './error';


export function getTestersOrGroups(value: string, file: string): string[] {
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  if (value) {
    testerSplitter(value);
  }
  return [];
}

export function getEmails(emails: string[], file: string): string[] {
  if (emails.length == 0) {
    ensureFileExists(file);
    const readFile = fs.readFileSync(file, "utf8");
    return testerSplitter(readFile);
  }
  return emails;
}

export function ensureFileExists(file: string, message = ""): void {
  if (!fs.existsSync(file)) {
    throw new FirebaseError(`File ${file} does not exist: ${message}`);
  }
}

function testerSplitter(value:string): string[] {
  return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => !!entry)
}
