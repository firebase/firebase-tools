import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as tar from "tar";
import * as util from "./util";

describe("util", () => {
  let tmpDir: tmp.DirResult;
  let rootDir: string;
  let distDir: string;

  beforeEach(() => {
    tmpDir = tmp.dirSync({ unsafeCleanup: true });
    rootDir = tmpDir.name;
    distDir = path.join(rootDir, "dist");
    fs.mkdirSync(distDir);
  });

  afterEach(() => {
    tmpDir.removeCallback();
  });

  describe("createTarArchive", () => {
    it("should include apphosting.yaml from root when archiving a subdirectory", async () => {
      // Setup: Create apphosting.yaml in root and some files in dist
      fs.writeFileSync(path.join(rootDir, "apphosting.yaml"), "env: []");
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      // Verify: List files in tarball
      const files: string[] = [];
      await tar.list({
        file: tarballPath,
        onentry: (entry: any) => files.push(entry.path),
      } as any);

      expect(files).to.include("dist/index.js");
      expect(files).to.include("apphosting.yaml");
    });

    it("should not fail if apphosting.yaml does not exist", async () => {
      // Setup: No apphosting.yaml, only files in dist
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      // Verify: List files in tarball
      const files: string[] = [];
      await tar.list({
        file: tarballPath,
        onentry: (entry: any) => files.push(entry.path),
      } as any);

      expect(files).to.include("dist/index.js");
      expect(files).to.not.include("apphosting.yaml");
    });
  });
});
