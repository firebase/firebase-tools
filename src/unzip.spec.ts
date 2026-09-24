import { expect } from "chai";
import * as fs from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { unzip, isChildDir } from "./unzip";
import { ZIP_CASES } from "./test/fixtures/zip-files";

describe("isChildDir", () => {
  it("should return true for legitimate subdirectories and files", () => {
    expect(isChildDir("/parent", "/parent/child")).to.be.true;
    expect(isChildDir("/parent", "/parent/child/grandchild.txt")).to.be.true;
    expect(isChildDir("/parent/", "/parent/child")).to.be.true;
  });

  it("should return false for the exact same path", () => {
    expect(isChildDir("/parent", "/parent")).to.be.false;
    expect(isChildDir("/parent/", "/parent/")).to.be.false;
  });

  it("should return false for sibling directories sharing a prefix (Zip Slip protection)", () => {
    expect(isChildDir("/parent", "/parent-sibling")).to.be.false;
    expect(isChildDir("/parent", "/parent_sibling/file.txt")).to.be.false;
    expect(isChildDir("/tmp/app", "/tmp/app-secret/config.json")).to.be.false;
  });

  it("should return false for parent or ancestor traversal", () => {
    expect(isChildDir("/parent/sub", "/parent")).to.be.false;
    expect(isChildDir("/parent/sub", "/parent/other")).to.be.false;
  });
});

describe("unzip", () => {
  let tempDir: string;

  before(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), "firebasetest-"));
  });

  after(async () => {
    await fs.promises.rm(tempDir, { recursive: true });
  });

  for (const { name, archivePath, inflatedDir, wantErr } of ZIP_CASES) {
    if (!wantErr) {
      it(`should unzip a zip file with ${name} case`, async () => {
        const unzipPath = path.join(tempDir, name);
        await unzip(archivePath, unzipPath);

        const expectedSize = await calculateFolderSize(inflatedDir);
        expect(await calculateFolderSize(unzipPath)).to.eql(expectedSize);
      }).timeout(10000);
    } else {
      it(`should throw "${wantErr}" when reading a zip file with ${name} case`, async () => {
        const unzipPath = path.join(tempDir, name);
        expect(unzip(archivePath, unzipPath)).to.eventually.be.rejectedWith(wantErr);
      });
    }
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
