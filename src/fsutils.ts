import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "fs";
import * as path from "path";
import * as fs from "fs-extra";
import { FirebaseError, getErrMsg } from "./error";
import { logger } from "./logger";

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
    fs.moveSync(srcPath, path.join(destDir, f));
  }
}

/**
 * Removes an empty directory if it exists and contains no files or subdirectories,
 * suppressing any errors and logging to debug.
 */
export async function removeDirectoryIfEmpty(absDirPath: string): Promise<void> {
  try {
    if (await fs.pathExists(absDirPath)) {
      const stat = await fs.stat(absDirPath);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(absDirPath);
        if (entries.length === 0) {
          await fs.remove(absDirPath);
        }
      }
    }
  } catch (err: unknown) {
    logger.debug(`Failed to clean up directory '${absDirPath}' if empty: ${getErrMsg(err)}`);
  }
}
