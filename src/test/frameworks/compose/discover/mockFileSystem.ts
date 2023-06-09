import { FileSystem } from "../../../../frameworks/compose/discover/types";

export class MockFileSystem implements FileSystem {
  constructor(private readonly mock: Record<string, string>) {}

  exists(path: string): Promise<boolean> {
    return Promise.resolve(path in this.mock);
  }

  read(path: string): Promise<string> {
    if (!(path in this.mock)) {
      throw new Error("File not found in the mock file system.");
    }
    return Promise.resolve(this.mock[path]);
  }
}
