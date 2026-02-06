import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import * as path from "path";
import { FirebaseError } from "./error";
import { moveSync } from "fs-extra";

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

// Move all files and directories inside srcDir to destDir
export function moveAll(srcDir: string, destDir: string) {
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  const files = listFiles(srcDir);
  for (const f of files) {
    const srcPath = path.join(srcDir, f);
    if (srcPath === destDir) continue;
    moveSync(srcPath, path.join(destDir, f));
  }
}
