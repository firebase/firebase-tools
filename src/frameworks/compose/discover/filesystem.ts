import { FileSystem } from "./types";
import { pathExists, readFile } from "fs-extra";
import * as path from "path";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";

/**
 * Find files or read file contents present in the directory.
 */
export class LocalFileSystem implements FileSystem {
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string> = {};

  constructor(private readonly cwd: string) {}

  async exists(file: string): Promise<boolean> {
    try {
      if (!(file in this.contentCache)) {
        this.existsCache[file] = await pathExists(path.resolve(this.cwd, file));
      }

      return this.existsCache[file];
    } catch (error) {
      throw new FirebaseError(`Error occured while searching for file: ${error}`);
    }
  }

  async read(file: string): Promise<string> {
    try {
      if (!(file in this.contentCache)) {
        const fileContents = await readFile(path.resolve(this.cwd, file), "utf-8");
        this.contentCache[file] = fileContents;
      }
      return this.contentCache[file];
    } catch (error) {
      logger.error("Error occured while reading file contents.");
      throw error;
    }
  }
}

/**
 * Convert ENOENT errors into null
 */
export async function readOrNull(fs: FileSystem, path: string): Promise<string | null> {
  try {
    return fs.read(path);
  } catch (err: any) {
    if (err && typeof err === "object" && err?.code === "ENOENT") {
      logger.debug("ENOENT error occured while reading file.");
      return null;
    }
    throw new Error(`Unknown error occured while reading file: ${err}`);
  }
}
