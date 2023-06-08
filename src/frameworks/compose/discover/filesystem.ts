import { FileSystem } from "./types";
import { pathExists, readFile } from "fs-extra";
import { join } from "path";

/**
 * Find or read contents present in the Repository.
 */
export class RepositoryFileSystem implements FileSystem {
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string> = {};
  private readonly readErrorCache: Record<string, Error> = {};

  constructor(private readonly cwd: string) {}

  async exists(file: string): Promise<boolean> {
    try {
      if (!(file in this.contentCache)) {
        // Get repository contents
        this.existsCache[file] = await pathExists(join(this.cwd, file));
      }

      return this.existsCache[file];
    } catch (error: any) {
      // File not found
      console.error("Error occured while searching for file:", error.message);
      return Promise.resolve(false);
    }
  }

  async read(path: string): Promise<string> {
    if (this.readErrorCache[path]) {
      throw this.readErrorCache[path];
    }
    if (!(path in this.contentCache)) {
      try {
        const fileContents = await readFile(join(this.cwd, path), "utf-8");
        this.contentCache[path] = fileContents;
      } catch (error: any) {
        new Error("Can't read file contents.");
      }
    }
    return this.contentCache[path];
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
    throw err;
  }
}
