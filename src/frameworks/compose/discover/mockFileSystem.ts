import { FileSystem } from "./types";

export class MockFileSystem implements FileSystem {
  private readonly existsCache: Record<string, boolean> = {};
  private readonly contentCache: Record<string, string> = {};

  constructor(private readonly fileSys: Record<string, string>) {}

  exists(path: string): Promise<boolean> {
    if (!(path in this.existsCache)) {
      this.existsCache[path] = path in this.fileSys;
    }

    return Promise.resolve(this.existsCache[path]);
  }

  read(path: string): Promise<string> {
    if (!(path in this.contentCache)) {
      if (!(path in this.fileSys)) {
        const err = new Error("File path not found");
        err.cause = "ENOENT";
        throw err;
      } else {
        this.contentCache[path] = this.fileSys[path];
      }
    }

    return Promise.resolve(this.contentCache[path]);
  }

  getContentCache(path: string): string {
    return this.contentCache[path];
  }

  getExistsCache(path: string): boolean {
    return this.existsCache[path];
  }
}
