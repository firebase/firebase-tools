import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as node from ".";
import * as versioning from "./versioning";
import * as utils from "../../../../utils";
import { FirebaseError } from "../../../../error";
import { Runtime } from "../supported";
import * as discovery from "../discovery";

const PROJECT_ID = "test-project";
const PROJECT_DIR = "/some/path";
const SOURCE_DIR = "/some/path/fns";

describe("NodeDelegate", () => {
  describe("getNodeBinary", () => {
    let warnSpy: sinon.SinonSpy;
    let successSpy: sinon.SinonSpy;
    let hostVersionMock: sinon.SinonStub;
    let localVersionMock: sinon.SinonStub;

    beforeEach(() => {
      warnSpy = sinon.spy(utils, "logLabeledWarning");
      successSpy = sinon.spy(utils, "logLabeledSuccess");
      hostVersionMock = sinon.stub(process, "versions");
      localVersionMock = sinon.stub(versioning, "findModuleVersion");
    });

    afterEach(() => {
      warnSpy.restore();
      successSpy.restore();
      hostVersionMock.restore();
      localVersionMock.restore();
    });

    it("prefers locally cached node version if matched with requested version", () => {
      localVersionMock.returns("12.0.0");
      hostVersionMock.value({ node: "14.5.0" });
      const requestedRuntime = "nodejs12";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);
      expect(delegate.getNodeBinary()).to.equal(path.join(SOURCE_DIR, "node_modules", "node"));
      expect(successSpy).to.have.been.calledWith(
        "functions",
        sinon.match("node@12 from local cache."),
      );
      expect(warnSpy).to.not.have.been.called;
    });

    it("checks if requested and hosted runtime version matches", () => {
      hostVersionMock.value({ node: "12.5.0" });
      const requestedRuntime = "nodejs12";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);
      expect(delegate.getNodeBinary()).to.equal(process.execPath);
      expect(successSpy).to.have.been.calledWith("functions", sinon.match("node@12 from host."));
      expect(warnSpy).to.not.have.been.called;
    });

    it("warns users if hosted and requested runtime version differs", () => {
      hostVersionMock.value({ node: "12.0.0" });
      const requestedRuntime = "nodejs10";
      const delegate = new node.Delegate(PROJECT_ID, PROJECT_DIR, SOURCE_DIR, requestedRuntime);

      expect(delegate.getNodeBinary()).to.equal(process.execPath);
      expect(successSpy).to.not.have.been.called;
      expect(warnSpy).to.have.been.calledWith("functions", sinon.match("doesn't match"));
    });

    it("throws errors if requested runtime version is invalid", () => {
      const invalidRuntime = "foobar";
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        invalidRuntime as Runtime,
      );

      expect(() => delegate.getNodeBinary()).to.throw(FirebaseError);
    });
  });

  describe("discoverBuild", () => {
    let getFunctionsSDKVersionMock: sinon.SinonStub;
    let detectFromYamlMock: sinon.SinonStub;

    beforeEach(() => {
      getFunctionsSDKVersionMock = sinon.stub(versioning, "getFunctionsSDKVersion");
      detectFromYamlMock = sinon.stub(discovery, "detectFromYaml");
    });

    afterEach(() => {
      getFunctionsSDKVersionMock.restore();
      detectFromYamlMock.restore();
    });

    it("throws error if SDK version is too old", async () => {
      getFunctionsSDKVersionMock.returns("3.19.0");
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      try {
        await delegate.discoverBuild({}, {});
        throw new Error("Should have thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(FirebaseError);
        expect(err.message).to.include("Please update firebase-functions SDK");
      }
    });

    it("proceeds if SDK version is valid", async () => {
      getFunctionsSDKVersionMock.returns("4.0.0");
      detectFromYamlMock.resolves({ endpoints: {} });
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      await delegate.discoverBuild({}, {});
      expect(detectFromYamlMock).to.have.been.called;
    });

    it("proceeds if SDK version is invalid", async () => {
      getFunctionsSDKVersionMock.returns("not-a-version");
      detectFromYamlMock.resolves({ endpoints: {} });
      const delegate = new node.Delegate(
        PROJECT_ID,
        PROJECT_DIR,
        SOURCE_DIR,
        "nodejs16" as Runtime,
      );
      await delegate.discoverBuild({}, {});
      expect(detectFromYamlMock).to.have.been.called;
    });
  });
  describe("findFunctionsBinary", () => {
    let projectDir: string;
    let sourceDir: string;

    function installSdk(storeDir: string, binShims: string[], bin: unknown): string {
      const nodeModules = path.join(sourceDir, "node_modules");
      const sdkDir = path.join(nodeModules, storeDir, "firebase-functions");
      fs.mkdirSync(path.join(sdkDir, "lib", "v2"), { recursive: true });
      fs.writeFileSync(path.join(sdkDir, "lib", "v2", "index.js"), "");
      fs.writeFileSync(
        path.join(sdkDir, "package.json"),
        JSON.stringify({ name: "firebase-functions", main: "lib/v2/index.js", bin }),
      );
      if (storeDir) {
        fs.symlinkSync(sdkDir, path.join(nodeModules, "firebase-functions"), "junction");
      }
      fs.mkdirSync(path.join(nodeModules, ".bin"), { recursive: true });
      for (const shim of binShims) {
        fs.writeFileSync(path.join(nodeModules, ".bin", shim), "");
      }
      return fs.realpathSync(sdkDir);
    }

    function findFunctionsBinary(): { binary: string[]; bin: string } {
      const delegate = new node.Delegate(PROJECT_ID, projectDir, sourceDir, "nodejs24");
      return { binary: delegate["findFunctionsBinary"](), bin: delegate.bin };
    }

    beforeEach(() => {
      projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "functions-binary-"));
      sourceDir = path.join(projectDir, "functions");
      fs.mkdirSync(sourceDir);
    });

    afterEach(() => {
      fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it("prefers the node_modules/.bin shim when it exists", () => {
      installSdk("", ["firebase-functions"], {
        "firebase-functions": "lib/bin/firebase-functions.js",
      });
      const { binary } = findFunctionsBinary();
      expect(binary).to.deep.equal([
        path.join(sourceDir, "node_modules", ".bin", "firebase-functions"),
      ]);
    });

    it("runs the SDK bin entry with node when Bun on Windows only creates .exe shims", () => {
      const sdkDir = installSdk(
        path.join(".bun", "firebase-functions@7.4.0+abc", "node_modules"),
        ["firebase-functions.exe", "firebase-functions.bunx"],
        { "firebase-functions": "lib/bin/firebase-functions.js" },
      );
      const { binary, bin } = findFunctionsBinary();
      expect(binary).to.deep.equal([bin, path.join(sdkDir, "lib", "bin", "firebase-functions.js")]);
    });

    it("runs the SDK bin entry with node when a .pnpm store only has .cmd shims", () => {
      const sdkDir = installSdk(
        path.join(".pnpm", "firebase-functions@7.4.0", "node_modules"),
        ["firebase-functions.cmd", "firebase-functions.ps1"],
        { "firebase-functions": "lib/bin/firebase-functions.js" },
      );
      const { binary, bin } = findFunctionsBinary();
      expect(binary).to.deep.equal([bin, path.join(sdkDir, "lib", "bin", "firebase-functions.js")]);
    });

    it("accepts a bin entry declared as a single path", () => {
      const sdkDir = installSdk("", [], "lib/bin/firebase-functions.js");
      const { binary, bin } = findFunctionsBinary();
      expect(binary).to.deep.equal([bin, path.join(sdkDir, "lib", "bin", "firebase-functions.js")]);
    });

    it("throws when the SDK declares no bin entry and no shim exists", () => {
      installSdk("", [], undefined);
      expect(() => findFunctionsBinary()).to.throw(
        FirebaseError,
        "Failed to find location of Firebase Functions SDK",
      );
    });
  });
});
