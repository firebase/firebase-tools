import { expect } from "chai";
import * as fs from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { unzip } from "./unzip";
import { ZIP_CASES } from "./test/fixtures/zip-files";

describe("unzip", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), "firebasetest-"));
  });

  after(async () => {
    await fs.promises.rm(tempDir, { recursive: true });
  });

  for (const { name, archivePath, inflatedDir } of ZIP_CASES) {
    it(`should unzip a zip file with ${name} case`, async () => {
      const unzipPath = path.join(tempDir, name);
      await unzip(archivePath, unzipPath);

      const expectedSize = await calculateFolderSize(inflatedDir);
      expect(await calculateFolderSize(unzipPath)).to.eql(expectedSize);
    });
  }
});

async function calculateFolderSize(folderPath: string): Promise<number> {
  const files = await fs.promises.readdir(folderPath);
  let size = 0;
  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      size += await calculateFolderSize(filePath);
    } else {
      size += stat.size;
    }
  }
  return size;
}
