import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as tar from "tar";
import * as util from "./util";
import * as sinon from "sinon";
import { AppHostingSingle } from "../../firebaseConfig";
import { logger } from "../../logger";

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

  describe("createLocalBuildTarArchive", () => {
    it("should include apphosting.yaml from root when archiving a subdirectory", async () => {
      // Setup: Create apphosting.yaml in root and some files in dist
      fs.writeFileSync(path.join(rootDir, "apphosting.yaml"), "env: []");
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      // Verify: List files in tarball
      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("apphosting.yaml");
    });

    it("should include .apphosting/bundle.yaml from root when archiving a subdirectory", async () => {
      // Setup: Create .apphosting/bundle.yaml in root and some files in dist
      const apphostingDir = path.join(rootDir, ".apphosting");
      fs.mkdirSync(apphostingDir);
      fs.writeFileSync(path.join(apphostingDir, "bundle.yaml"), "runConfig: {}");
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      // Verify: List files in tarball
      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include(".apphosting/bundle.yaml");
    });

    it("should not fail if apphosting.yaml does not exist", async () => {
      // Setup: No apphosting.yaml, only files in dist
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      // Verify: List files in tarball
      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.not.include("apphosting.yaml");
    });

    it("should NOT respect ignore patterns in config for local builds", async () => {
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");
      fs.writeFileSync(path.join(distDir, "ignored.txt"), "ignore me");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: ["**/ignored.txt"],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("dist/ignored.txt");
    });

    it("should NOT use default node_modules ignore for local builds", async () => {
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");
      const nodeModulesDir = path.join(distDir, "node_modules");
      fs.mkdirSync(nodeModulesDir);
      fs.writeFileSync(path.join(nodeModulesDir, "some-file.js"), "console.log('vendor')");

      const configWithoutIgnore: AppHostingSingle = {
        backendId: "test-backend",
        rootDir: "",
        ignore: undefined as unknown as string[],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        configWithoutIgnore,
        rootDir,
        path.relative(rootDir, distDir),
      );

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("dist/node_modules/some-file.js");
    });

    it("should NOT respect .gitignore patterns for local builds", async () => {
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");
      fs.writeFileSync(path.join(distDir, "gitignored.txt"), "ignore me");
      fs.writeFileSync(path.join(distDir, ".gitignore"), "gitignored.txt");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(
        config,
        rootDir,
        path.relative(rootDir, distDir),
      );

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("dist/gitignored.txt");
    });

    it("should log a warning if local build archive size exceeds limit", async () => {
      const loggerWarnSpy = sinon.spy(logger, "warn");
      try {
        fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");

        const config = {
          backendId: "test-backend",
          rootDir: "",
          ignore: [],
          localBuild: true,
        };

        await util.createLocalBuildTarArchive(config, rootDir, path.relative(rootDir, distDir), 1);

        expect(loggerWarnSpy.calledOnce).to.be.true;
        expect(loggerWarnSpy.firstCall.args[0]).to.match(/The final build artifact is larger than/);
      } finally {
        loggerWarnSpy.restore();
      }
    });
  });
});
