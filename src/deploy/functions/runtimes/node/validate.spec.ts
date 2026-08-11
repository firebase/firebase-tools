import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs";
import * as spawn from "cross-spawn";

import { FirebaseError } from "../../../../error";
import * as validate from "./validate";
import * as fsutils from "../../../../fsutils";
import * as utils from "../../../../utils";

const cjson = require("cjson");

describe("validate", () => {
  describe("packageJsonIsValid", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let cjsonLoadStub: sinon.SinonStub;
    let fileExistsStub: sinon.SinonStub;

    beforeEach(() => {
      fileExistsStub = sandbox.stub(fsutils, "fileExistsSync");
      cjsonLoadStub = sandbox.stub(cjson, "load");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should throw error if package.json file is missing", () => {
      fileExistsStub.withArgs("sourceDir/package.json").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "No npm package found");
    });

    it("should throw error if functions source file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should throw error if main is defined and that file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", main: "src/main.js", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/src/main.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should not throw error if runtime is set in the config and the engines field is not set", () => {
      cjsonLoadStub.returns({ name: "my-project" });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(true);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.not.throw();
    });
  });

  describe("warnIfLegacyPeerDepsMismatch", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    const LOCKFILE = path.join("sourceDir", "package-lock.json");
    const NPMRC = path.join("sourceDir", ".npmrc");
    let fileExistsStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let spawnStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
      fileExistsStub = sandbox.stub(fsutils, "fileExistsSync").returns(false);
      readFileStub = sandbox.stub(fs, "readFileSync");
      spawnStub = sandbox.stub(spawn, "sync");
      warnStub = sandbox.stub(utils, "logLabeledWarning");
      fileExistsStub.withArgs(LOCKFILE).returns(true);
      spawnStub.returns({ status: 0, stdout: "true\n" } as any);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("warns when npm is configured with legacy-peer-deps and no .npmrc ships", () => {
      validate.warnIfLegacyPeerDepsMismatch("sourceDir");

      expect(warnStub).to.have.been.calledWithMatch("functions", "legacy-peer-deps=true");
    });

    it("does not warn when there is no lockfile", () => {
      fileExistsStub.withArgs(LOCKFILE).returns(false);

      validate.warnIfLegacyPeerDepsMismatch("sourceDir");

      expect(spawnStub).to.not.have.been.called;
      expect(warnStub).to.not.have.been.called;
    });

    it("does not warn when an .npmrc pins the setting", () => {
      fileExistsStub.withArgs(NPMRC).returns(true);
      readFileStub.withArgs(NPMRC, "utf8").returns("legacy-peer-deps=true\n");

      validate.warnIfLegacyPeerDepsMismatch("sourceDir");

      expect(warnStub).to.not.have.been.called;
    });

    it("warns when an .npmrc exists but does not pin the setting", () => {
      fileExistsStub.withArgs(NPMRC).returns(true);
      readFileStub.withArgs(NPMRC, "utf8").returns("registry=https://example.com\n");

      validate.warnIfLegacyPeerDepsMismatch("sourceDir");

      expect(warnStub).to.have.been.called;
    });

    it("does not warn when npm is configured with the default", () => {
      spawnStub.returns({ status: 0, stdout: "false\n" } as any);

      validate.warnIfLegacyPeerDepsMismatch("sourceDir");

      expect(warnStub).to.not.have.been.called;
    });

    it("stays quiet when npm cannot be run", () => {
      spawnStub.returns({ error: new Error("ENOENT"), status: null } as any);

      expect(() => validate.warnIfLegacyPeerDepsMismatch("sourceDir")).to.not.throw();
      expect(warnStub).to.not.have.been.called;
    });
  });
});
