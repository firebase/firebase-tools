import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as tar from "tar";
import * as util from "./util";
import * as sinon from "sinon";
import { CLOUD_RUN_SIZE_LIMIT_BYTES } from "../../apphosting/constants";
import { AppHostingSingle } from "../../firebaseConfig";
import * as fsAsync from "../../fsAsync";
import * as gcs from "../../gcp/storage";
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

  describe("createSourceDeployArchive", () => {
    const web: AppHostingSingle = { backendId: "web", rootDir: "web", ignore: [] };

    afterEach(() => sinon.restore());

    it("applies the project's .gitignore files above the folder it zips", async () => {
      const walk = sinon.stub(fsAsync, "readdirRecursive").resolves([]);
      const webDir = path.join(rootDir, "web");

      await util.createSourceDeployArchive(web, webDir, rootDir);

      expect(walk).to.have.been.calledWithMatch({
        path: webDir,
        supportGitIgnore: true,
        gitIgnoreRoot: rootDir,
      });
    });

    it("applies only the zipped folder's own .gitignore files by default", async () => {
      const walk = sinon.stub(fsAsync, "readdirRecursive").resolves([]);

      await util.createSourceDeployArchive(web, rootDir);

      expect(walk).to.have.been.calledWithMatch({ path: rootDir, gitIgnoreRoot: rootDir });
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
        buildFolder: path.join("/project", "web"),
        appFolder: "",
      });
      expect(util.buildDirectory("/project")).to.deep.equal({
        buildFolder: path.join("/project"),
        appFolder: "",
      });
      expect(util.buildDirectory("/project", ".")).to.deep.equal({
        buildFolder: path.join("/project"),
        appFolder: "",
      });
    });

    it("builds an app in a Turborepo or Nx monorepo from the monorepo's root", () => {
      withFiles(path.join("/project", "turbo.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        buildFolder: path.join("/project"),
        appFolder: "apps/web",
      });

      sinon.restore();
      withFiles(path.join("/project", "nx.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        buildFolder: path.join("/project"),
        appFolder: "apps/web",
      });
    });

    it("uses the closest folder above the app with nx.json or turbo.json", () => {
      withFiles(
        path.join("/project", "turbo.json"),
        path.join("/project", "monorepo", "turbo.json"),
      );
      expect(util.buildDirectory("/project", "monorepo/apps/web")).to.deep.equal({
        buildFolder: path.join("/project", "monorepo"),
        appFolder: "apps/web",
      });
    });

    it("builds from the app's folder if the app is the monorepo's root", () => {
      withFiles(path.join("/project", "apps/web", "nx.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        buildFolder: path.join("/project", "apps/web"),
        appFolder: "",
      });
    });

    it("doesn't look for a monorepo above the project", () => {
      withFiles(path.join("/", "turbo.json"));
      expect(util.buildDirectory("/project", "apps/web")).to.deep.equal({
        buildFolder: path.join("/project", "apps/web"),
        appFolder: "",
      });
    });
  });

  describe("uploadArchive", () => {
    let uploadStub: sinon.SinonStub;

    beforeEach(() => {
      uploadStub = sinon.stub(gcs, "uploadObject").resolves({
        bucket: "sources",
        object: "web.zip",
        generation: "1",
      });
      sinon.stub(fs, "createReadStream").returns("stream" as unknown as fs.ReadStream);
    });

    afterEach(() => sinon.restore());

    it("uploads a source deploy's zip", async () => {
      const uploaded = await util.uploadArchive("/tmp/web.zip", "sources", /* localBuild= */ false);

      expect(uploaded).to.deep.equal({ bucket: "sources", object: "web.zip" });
      expect(uploadStub).to.have.been.calledOnceWithExactly(
        { file: "/tmp/web.zip", stream: "stream" },
        "sources",
        gcs.ContentType.ZIP,
        undefined,
      );
    });

    it("uploads a local build's tarball, which has to fit Cloud Run's size limit", async () => {
      await util.uploadArchive("/tmp/web.tar.gz", "sources", /* localBuild= */ true);

      expect(uploadStub).to.have.been.calledOnceWithExactly(
        { file: "/tmp/web.tar.gz", stream: "stream" },
        "sources",
        gcs.ContentType.TAR,
        CLOUD_RUN_SIZE_LIMIT_BYTES,
      );
    });
  });
});
