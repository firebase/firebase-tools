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

        await util.createLocalBuildTarArchive(
          config,
          rootDir,
          [path.relative(rootDir, distDir)],
          1,
        );

        expect(loggerWarnSpy.calledOnce).to.be.true;
        expect(loggerWarnSpy.firstCall.args[0]).to.match(/The final build artifact is larger than/);
      } finally {
        loggerWarnSpy.restore();
      }
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

  describe("buildDirectory", () => {
    afterEach(() => sinon.restore());

    /** Pretends that only these files exist. */
    function withFiles(...files: string[]): void {
      sinon.stub(fs, "existsSync").callsFake((file) => files.includes(file as string));
    }

    it("builds an app from its own folder if it isn't in a monorepo", () => {
      withFiles(path.join("/project", "web", "package.json"));
      expect(util.buildDirectory("/project", "web")).to.deep.equal({
        dir: path.join("/project", "web"),
        app: "",
      });
      expect(util.buildDirectory("/project")).to.deep.equal({
        dir: path.join("/project"),
        app: "",
      });
      expect(util.buildDirectory("/project", ".")).to.deep.equal({
        dir: path.join("/project"),
        app: "",
      });
    });

    it("builds an app in a Turborepo or Nx monorepo from the monorepo's root", () => {
      withFiles(path.join("/project", "turbo.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        dir: path.join("/project"),
        app: "apps/web",
      });

      sinon.restore();
      withFiles(path.join("/project", "nx.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        dir: path.join("/project"),
        app: "apps/web",
      });
    });

    it("uses the closest folder above the app with nx.json or turbo.json", () => {
      withFiles(
        path.join("/project", "turbo.json"),
        path.join("/project", "monorepo", "turbo.json"),
      );
      expect(util.buildDirectory("/project", "monorepo/apps/web")).to.deep.equal({
        dir: path.join("/project", "monorepo"),
        app: "apps/web",
      });
    });

    it("builds from the app's folder if the app is the monorepo's root", () => {
      withFiles(path.join("/project", "apps/web", "nx.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        dir: path.join("/project", "apps/web"),
        app: "",
      });
    });

    it("doesn't look for a monorepo outside the project", () => {
      withFiles(path.join("/", "turbo.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        dir: path.join("/project", "apps/web"),
        app: "",
      });
      expect(util.buildDirectory("/project", "../other")).to.deep.equal({
        dir: path.join("/project", "../other"),
        app: "",
      });
    });
  });

  describe("isInDirectory", () => {
    it("is true for the directory itself and anything in it", () => {
      expect(util.isInDirectory(path.join("/project"), path.join("/project"))).to.be.true;
      expect(util.isInDirectory(path.join("/project", "apps/web"), path.join("/project"))).to.be
        .true;
      // A folder named "..foo" is in the project, even though its name starts with "..".
      expect(util.isInDirectory(path.join("/project", "..foo"), path.join("/project"))).to.be.true;
    });

    it("is false for anything outside the directory", () => {
      expect(util.isInDirectory(path.join("/"), path.join("/project"))).to.be.false;
      expect(util.isInDirectory(path.join("/other"), path.join("/project"))).to.be.false;
      // A sibling whose name starts with the directory's name isn't in it.
      expect(util.isInDirectory(path.join("/project-other"), path.join("/project"))).to.be.false;
    });
  });
});
