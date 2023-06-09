import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { unzip } from "../unzip";
const fixturesDir = path.resolve(__dirname, "./fixtures");

const ZIP_FIXTURES_PATH = path.join(fixturesDir, "zip-files");
const ZIP_TEMPORARY_PATH = path.join(ZIP_FIXTURES_PATH, "temp");
const ZIP_UNZIPPER_PATH = path.join(ZIP_FIXTURES_PATH, "node-unzipper-testData");

describe("unzip", () => {
  before(async () => {
    await fs.promises.mkdir(ZIP_TEMPORARY_PATH, { recursive: true });
  });

  after(async () => {
    await fs.promises.rmdir(ZIP_TEMPORARY_PATH, { recursive: true });
  });

  const cases = [
    { name: "compressed-cp866" },
    { name: "compressed-directory-entry" },
    { name: "compressed-flags-set" },
    { name: "compressed-standard" },
    { name: "uncompressed" },
    { name: "zip-slip" },
    { name: "zip64" },
  ];

  for (const { name } of cases) {
    it(`should unzip a zip file with ${name} case`, async () => {
      const zipPath = path.join(ZIP_UNZIPPER_PATH, name, "archive.zip");
      const unzipPath = path.join(ZIP_TEMPORARY_PATH, name);
      await unzip(zipPath, unzipPath);

      // contains a folder "inflated"
      const inflatedPath = path.join(ZIP_UNZIPPER_PATH, name, "inflated");
      expect(await fs.promises.stat(inflatedPath)).to.be.ok;

      // // inflated folder's size is "size"
      expect(await calculateFolderSize(inflatedPath)).to.eql(await calculateFolderSize(unzipPath));
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
