import { readFileSync, readdirSync, statSync } from "fs";
import { FirebaseError } from "./error";

export function fileExistsSync(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch (e: any) {
    return false;
  }
}

export function dirExistsSync(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (e: any) {
    return false;
  }
}

export function readFile(path: string): string {
  try {
    return readFileSync(path).toString();
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FirebaseError(`File not found: ${path}`);
    }
    throw e;
  }
}

export function listFiles(path: string): string[] {
  try {
    return readdirSync(path);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FirebaseError(`Directory not found: ${path}`);
    }
    throw e;
  }
}
