import { FileSystem } from "./types";
import { pathExists, readFile } from "fs-extra";
import { logger } from "../../..";
import * as path from "path";

/**
 * Find files or read contents present in the Repository.
 */
export class RepositoryFileSystem implements FileSystem {
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string> = {};
  private readonly readErrorCache: Record<string, Error> = {};

  constructor(private readonly cwd: string) {}

  async exists(file: string): Promise<boolean> {
    try {
      console.log("+++++++PPPPP+++++++++");
      console.log(path.resolve(this.cwd, file));
      console.log("+++++++PPPPP+++++++++");
      if (!(file in this.contentCache)) {
        this.existsCache[file] = await pathExists(path.resolve(this.cwd, file));
      }

      return this.existsCache[file];
    } catch (error: any) {
      logger.error("Error occured while searching for file:", error.message);
      throw error;
    }
  }

  async read(file: string): Promise<string> {
    if (this.readErrorCache[file]) {
      throw this.readErrorCache[file];
    }
    if (!(file in this.contentCache)) {
      try {
        const fileContents = await readFile(path.resolve(this.cwd, file), "utf-8");
        this.contentCache[file] = fileContents;
      } catch (error: any) {
        logger.error("Error occured while reading file contents:", error.message);
        throw error;
      }
    }
    return this.contentCache[file];
  }
}

/**
 * Convert ENOENT errors into null
 */
export async function readOrNull(fs: FileSystem, path: string): Promise<string | null> {
  try {
    return fs.read(path);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    logger.error("Unknown error occured while trying to read file contents.");
    throw err;
  }
}
