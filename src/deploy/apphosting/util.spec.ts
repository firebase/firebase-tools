import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as tar from "tar";
import * as util from "./util";
import { AppHostingSingle } from "../../firebaseConfig";

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

    it("should NOT respect ignore patterns in config for local builds", async () => {
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");
      fs.writeFileSync(path.join(distDir, "ignored.txt"), "ignore me");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: ["**/ignored.txt"],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(config, rootDir, [
        path.relative(rootDir, distDir),
      ]);

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
        [path.relative(rootDir, distDir)],
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

      const tarballPath: string = await util.createLocalBuildTarArchive(config, rootDir, [
        path.relative(rootDir, distDir),
      ]);

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("dist/gitignored.txt");
    });

    it("should package mixed files and folders dynamically using fs.statSync", async () => {
      const serverDir = path.join(rootDir, "server");
      fs.mkdirSync(serverDir);
      fs.writeFileSync(path.join(serverDir, "index.js"), "console.log('server')");

      fs.writeFileSync(path.join(rootDir, "standalone.js"), "console.log('standalone')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(config, rootDir, [
        "server",
        "standalone.js",
      ]);

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("server/index.js");
      expect(files).to.include("standalone.js");
      expect(files).to.not.include("apphosting.yaml");
      expect(files).to.not.include(".apphosting/bundle.yaml");
    });

    it("should package the entire root directory if outputFiles is empty (Angular fallback)", async () => {
      fs.writeFileSync(path.join(rootDir, "apphosting.yaml"), "env: []");
      fs.writeFileSync(path.join(distDir, "index.js"), "console.log('hello')");
      fs.writeFileSync(path.join(rootDir, "server.js"), "console.log('server')");

      const config = {
        backendId: "test-backend",
        rootDir: "",
        ignore: [],
      };

      const tarballPath: string = await util.createLocalBuildTarArchive(config, rootDir, []);

      const files: string[] = [];
      tar.list({
        file: tarballPath,
        sync: true,
        onentry: (entry: { path: string }) => files.push(entry.path),
      });

      expect(files).to.include("dist/index.js");
      expect(files).to.include("server.js");
      expect(files).to.include("apphosting.yaml");
    });
  });
});
