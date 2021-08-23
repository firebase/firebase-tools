import * as fs from 'fs-extra';
import {ensureFileExists} from './ensureFileExists';


export function testerEmailParser(value: string, file: string): string[] {
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  if (value) {
    testerSplitter(value);
  }
  return [];
}

export function getEmails(emails: string[], file: string):string[]{
  if (emails.length == 0) {
    ensureFileExists(file);
    const readFile = fs.readFileSync(file, "utf8");
    return testerSplitter(readFile);
  }
  return emails;
}

function testerSplitter(value:string):string[]{
  return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => !!entry)
}