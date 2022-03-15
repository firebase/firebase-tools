import { readFileSync, statSync } from "fs";
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
<<<<<<< HEAD
<<<<<<< HEAD
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
=======
  } catch (e: any) {
    if (e.code === "ENOENT") {
>>>>>>> eff938c0 (Make StorageRulesManager an interface; add StorageRulesManagerRegistry)
=======
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
>>>>>>> c196f790 (PR feedback, mostly re: API usage)
      throw new FirebaseError(`File not found: ${path}`);
    }
    throw e;
  }
}
