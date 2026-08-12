import { expect } from "chai";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs";

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

  describe("parseLegacyPeerDeps", () => {
    it("reads the setting", () => {
      expect(validate.parseLegacyPeerDeps("legacy-peer-deps=true\n")).to.be.true;
      expect(validate.parseLegacyPeerDeps("legacy-peer-deps=false\n")).to.be.false;
      expect(validate.parseLegacyPeerDeps("  legacy-peer-deps = true  \n")).to.be.true;
    });

    it("returns undefined when the file does not set it", () => {
      expect(validate.parseLegacyPeerDeps("registry=https://example.com\n")).to.be.undefined;
      expect(validate.parseLegacyPeerDeps("")).to.be.undefined;
    });

    it("ignores commented out settings", () => {
      expect(validate.parseLegacyPeerDeps("; legacy-peer-deps=true\n")).to.be.undefined;
      expect(validate.parseLegacyPeerDeps("# legacy-peer-deps=true\n")).to.be.undefined;
      expect(validate.parseLegacyPeerDeps("legacy-peer-deps=true ; why\n")).to.be.true;
    });

    it("takes the last assignment, as npm does", () => {
      expect(validate.parseLegacyPeerDeps("legacy-peer-deps=true\nlegacy-peer-deps=false\n")).to.be
        .false;
    });
  });

  describe("findMissingPeerDeps", () => {
    it("returns nothing for a lockfile with every peer present", () => {
      const lockfile = {
        packages: {
          "": {},
          "node_modules/jest": {},
          "node_modules/firebase-functions-test": {
            peerDependencies: { jest: ">=28.0.0" },
          },
        },
      };

      expect(validate.findMissingPeerDeps(lockfile)).to.deep.equal([]);
    });

    it("finds a peer the lockfile omits", () => {
      const lockfile = {
        packages: {
          "": {},
          "node_modules/firebase-functions-test": {
            peerDependencies: { jest: ">=28.0.0", "firebase-admin": "^13.0.0" },
          },
          "node_modules/firebase-admin": {},
        },
      };

      expect(validate.findMissingPeerDeps(lockfile)).to.deep.equal(["jest"]);
    });

    it("skips optional peers", () => {
      const lockfile = {
        packages: {
          "": {},
          "node_modules/pkg": {
            peerDependencies: { "not-installed": "*" },
            peerDependenciesMeta: { "not-installed": { optional: true } },
          },
        },
      };

      expect(validate.findMissingPeerDeps(lockfile)).to.deep.equal([]);
    });

    it("resolves a peer nested beside its dependent", () => {
      const lockfile = {
        packages: {
          "": {},
          "node_modules/a/node_modules/b": { peerDependencies: { c: "*" } },
          "node_modules/a/node_modules/c": {},
        },
      };

      expect(validate.findMissingPeerDeps(lockfile)).to.deep.equal([]);
    });

    it("resolves a peer hoisted to the root", () => {
      const lockfile = {
        packages: {
          "": {},
          "node_modules/a/node_modules/b": { peerDependencies: { c: "*" } },
          "node_modules/c": {},
        },
      };

      expect(validate.findMissingPeerDeps(lockfile)).to.deep.equal([]);
    });

    it("returns nothing for a lockfileVersion 1 lockfile", () => {
      expect(validate.findMissingPeerDeps({ dependencies: {} } as any)).to.deep.equal([]);
    });
  });

  describe("warnIfLockfileOmitsPeerDeps", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    const LOCKFILE = path.join("sourceDir", "package-lock.json");
    const SHRINKWRAP = path.join("sourceDir", "npm-shrinkwrap.json");
    const NPMRC = path.join("sourceDir", ".npmrc");
    // firebase-functions-test peer depends on jest, which a legacy-peer-deps
    // install leaves out of the lockfile entirely.
    const BROKEN_LOCKFILE = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/firebase-functions-test": { peerDependencies: { jest: ">=28.0.0" } },
      },
    });
    const GOOD_LOCKFILE = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/jest": {},
        "node_modules/firebase-functions-test": { peerDependencies: { jest: ">=28.0.0" } },
      },
    });
    let fileExistsStub: sinon.SinonStub;
    let readFileStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
      fileExistsStub = sandbox.stub(fsutils, "fileExistsSync").returns(false);
      readFileStub = sandbox.stub(fs, "readFileSync");
      warnStub = sandbox.stub(utils, "logLabeledWarning");
      fileExistsStub.withArgs(LOCKFILE).returns(true);
      readFileStub.withArgs(LOCKFILE, "utf8").returns(BROKEN_LOCKFILE);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("warns and names the missing peer", () => {
      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.have.been.calledWithMatch("functions", "jest");
    });

    it("checks npm-shrinkwrap.json too", () => {
      fileExistsStub.withArgs(LOCKFILE).returns(false);
      fileExistsStub.withArgs(SHRINKWRAP).returns(true);
      readFileStub.withArgs(SHRINKWRAP, "utf8").returns(BROKEN_LOCKFILE);

      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.have.been.calledWithMatch("functions", "npm-shrinkwrap.json");
    });

    it("does not warn when the lockfile is complete", () => {
      readFileStub.withArgs(LOCKFILE, "utf8").returns(GOOD_LOCKFILE);

      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.not.have.been.called;
    });

    it("does not warn when there is no lockfile", () => {
      fileExistsStub.withArgs(LOCKFILE).returns(false);

      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.not.have.been.called;
    });

    it("does not warn when a shipping .npmrc turns legacy-peer-deps on", () => {
      fileExistsStub.withArgs(NPMRC).returns(true);
      readFileStub.withArgs(NPMRC, "utf8").returns("legacy-peer-deps=true\n");

      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.not.have.been.called;
    });

    it("warns when the .npmrc turns legacy-peer-deps off", () => {
      fileExistsStub.withArgs(NPMRC).returns(true);
      readFileStub.withArgs(NPMRC, "utf8").returns("legacy-peer-deps=false\n");

      validate.warnIfLockfileOmitsPeerDeps("sourceDir");

      expect(warnStub).to.have.been.called;
    });

    it("warns when the .npmrc is configured out of the upload", () => {
      fileExistsStub.withArgs(NPMRC).returns(true);
      readFileStub.withArgs(NPMRC, "utf8").returns("legacy-peer-deps=true\n");

      // The setting never reaches the build server if the file is not uploaded.
      validate.warnIfLockfileOmitsPeerDeps("sourceDir", ["node_modules", ".npmrc"]);

      expect(warnStub).to.have.been.called;
    });

    it("stays quiet on an unreadable lockfile rather than failing the deploy", () => {
      readFileStub.withArgs(LOCKFILE, "utf8").returns("{ not json");

      expect(() => validate.warnIfLockfileOmitsPeerDeps("sourceDir")).to.not.throw();
      expect(warnStub).to.not.have.been.called;
    });

    it("stays quiet when reading the lockfile throws", () => {
      readFileStub.withArgs(LOCKFILE, "utf8").throws(new Error("EACCES"));

      expect(() => validate.warnIfLockfileOmitsPeerDeps("sourceDir")).to.not.throw();
      expect(warnStub).to.not.have.been.called;
    });
  });
});
