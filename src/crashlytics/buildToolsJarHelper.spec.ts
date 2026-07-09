import * as chai from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import chaiAsPromised from "chai-as-promised";
import spawn from "cross-spawn";
import * as downloadUtils from "../downloadUtils";
import { FirebaseError } from "../error";

chai.use(chaiAsPromised);
const expect = chai.expect;

// Note: we have to use require() here because our test needs to stub out dependencies
// that are imported at the module-level in buildToolsJarHelper.ts.
/* eslint-disable @typescript-eslint/no-var-requires */

describe("buildToolsJarHelper", () => {
  let buildToolsJarHelper: any;
  let sandbox: sinon.SinonSandbox;

  const jarVersion = "3.0.3";
  const fakeHomeDir = "/fake/home";
  const cacheDir = path.join(fakeHomeDir, ".cache", "firebase", "crashlytics", "buildtools");
  const jarPath = path.join(cacheDir, `crashlytics-buildtools-${jarVersion}.jar`);

  let downloadStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let rmSyncStub: sinon.SinonStub;
  let mkdirSyncStub: sinon.SinonStub;
  let copySyncStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(os, "homedir").returns(fakeHomeDir);

    downloadStub = sandbox.stub(downloadUtils, "downloadToTmp").resolves("/tmp/tmp.jar");
    existsSyncStub = sandbox.stub(fs, "existsSync");
    rmSyncStub = sandbox.stub(fs, "rmSync");
    mkdirSyncStub = sandbox.stub(fs, "mkdirSync");
    copySyncStub = sandbox.stub(fs, "copySync");

    // Clear the module cache to ensure we get a fresh import with our stubs
    delete require.cache[require.resolve("./buildToolsJarHelper")];
    buildToolsJarHelper = require("./buildToolsJarHelper");
  });

  afterEach(() => {
    sandbox.restore();
    delete process.env.CRASHLYTICS_LOCAL_JAR;
  });

  describe("fetchBuildtoolsJar", () => {
    it("should use the local jar override if provided", async () => {
      process.env.CRASHLYTICS_LOCAL_JAR = "/local/path/to/jar.jar";
      const result = await buildToolsJarHelper.fetchBuildtoolsJar();
      expect(result).to.equal("/local/path/to/jar.jar");
      expect(downloadStub).to.not.have.been.called;
    });

    it("should return the path to the cached jar if it exists", async () => {
      existsSyncStub.withArgs(jarPath).returns(true);

      const result = await buildToolsJarHelper.fetchBuildtoolsJar();

      expect(result).to.equal(jarPath);
      expect(downloadStub).to.not.have.been.called;
    });

    it("should download the jar if it does not exist in the cache and the cache dir doesn't exist", async () => {
      existsSyncStub.withArgs(jarPath).returns(false);
      existsSyncStub.withArgs(cacheDir).returns(false);

      const result = await buildToolsJarHelper.fetchBuildtoolsJar();

      expect(downloadStub).to.have.been.calledOnce;
      expect(mkdirSyncStub).to.have.been.calledWith(cacheDir, { recursive: true });
      expect(copySyncStub).to.have.been.calledWith("/tmp/tmp.jar", jarPath);
      expect(rmSyncStub).to.not.have.been.called;
      expect(result).to.equal(jarPath);
    });

    it("should delete old cache and download the new jar if cache dir exists but jar file doesn't", async () => {
      existsSyncStub.withArgs(jarPath).returns(false);
      existsSyncStub.withArgs(cacheDir).returns(true);

      const result = await buildToolsJarHelper.fetchBuildtoolsJar();

      expect(rmSyncStub).to.have.been.calledWith(cacheDir, { recursive: true, force: true });
      expect(downloadStub).to.have.been.calledOnce;
      expect(mkdirSyncStub).to.have.been.calledWith(cacheDir, { recursive: true });
      expect(copySyncStub).to.have.been.calledWith("/tmp/tmp.jar", jarPath);
      expect(result).to.equal(jarPath);
    });
  });

  describe("runBuildtoolsCommand", () => {
    let spawnSyncStub: sinon.SinonStub;

    beforeEach(() => {
      spawnSyncStub = sandbox.stub(spawn, "sync");
    });

    it("should call spawn.sync with the correct arguments", () => {
      spawnSyncStub.returns({ status: 0 });
      const jarFile = "my.jar";
      const args = ["arg1", "arg2"];

      buildToolsJarHelper.runBuildtoolsCommand(jarFile, args, false);

      expect(spawnSyncStub).to.have.been.calledWith(
        "java",
        ["-jar", jarFile, ...args, "-clientName", "firebase-cli;crashlytics-buildtools"],
        { stdio: "pipe" },
      );
    });

    it("should use 'inherit' for stdio when debug is true", () => {
      spawnSyncStub.returns({ status: 0 });
      const jarFile = "my.jar";
      const args = ["arg1", "arg2"];

      buildToolsJarHelper.runBuildtoolsCommand(jarFile, args, true);

      expect(spawnSyncStub).to.have.been.calledWith(
        "java",
        ["-jar", jarFile, ...args, "-clientName", "firebase-cli;crashlytics-buildtools"],
        { stdio: "inherit" },
      );
    });

    it("should throw a FirebaseError on command failure", () => {
      spawnSyncStub.returns({ status: 1, stdout: "error output" });
      const jarFile = "my.jar";
      const args = ["arg1", "arg2"];

      expect(() => buildToolsJarHelper.runBuildtoolsCommand(jarFile, args, false)).to.throw(
        FirebaseError,
        /java command failed/,
      );
    });

    it("should not throw an error on command success", () => {
      spawnSyncStub.returns({ status: 0 });
      const jarFile = "my.jar";
      const args = ["arg1", "arg2"];

      expect(() => buildToolsJarHelper.runBuildtoolsCommand(jarFile, args, false)).to.not.throw();
    });
  });
});
