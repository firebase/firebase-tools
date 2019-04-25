import { expect } from "chai";
import * as fsutils from "../../../fsutils";
import * as validate from "../../../deploy/functions/validate";
import * as projectPath from "../../../projectPath";
import * as FirebaseError from "../../../error";
import * as sinon from "sinon";

// have to require this because no @types/cjson available
// tslint:disable-next-line
const cjson = require("cjson");

describe("validate", () => {
  describe("functionsDirectoryExists", () => {
    let sandbox: sinon.SinonSandbox;
    let resolvePpathStub: sinon.SinonStub;
    let dirExistsStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      resolvePpathStub = sandbox.stub(projectPath, "resolveProjectPath");
      dirExistsStub = sandbox.stub(fsutils, "dirExistsSync");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should not throw error if functions directory is present", () => {
      resolvePpathStub.returns("some/path/to/project");
      dirExistsStub.returns(true);
      expect(() => {
        validate.functionsDirectoryExists("cwd", "sourceDirName");
      }).to.not.throw;
    });

    it("should throw error if the functions directory does not exist", () => {
      resolvePpathStub.returns("some/path/to/project");
      dirExistsStub.returns(false);
      expect(() => {
        validate.functionsDirectoryExists("cwd", "sourceDirName");
      }).to.throw(FirebaseError);
    });
  });

  describe("functionNamesAreValid", () => {
    it("should allow properly formatted function names", () => {
      const properNames = ["my-function-1", "my-function-2"];
      expect(() => {
        validate.functionNamesAreValid(properNames);
      }).to.not.throw;
    });

    it("should throw error on improperly formatted function names", () => {
      const properNames = ["my-function@#$%@#$", "my-function^#%#@"];
      expect(() => {
        validate.functionNamesAreValid(properNames);
      }).to.throw(FirebaseError);
    });

    it("should throw error if some function names are improperly formatted", () => {
      const properNames = ["my-function-1", "my-FUNCTION!@#$"];
      expect(() => {
        validate.functionNamesAreValid(properNames);
      }).to.throw(FirebaseError);
    });

    it("should throw error on empty function name", () => {
      const properNames = [""];
      expect(() => {
        validate.functionNamesAreValid(properNames);
      }).to.throw(FirebaseError);
    });
  });

  describe("packageJsonIsValid", () => {
    let sandbox: sinon.SinonSandbox;
    let cjsonLoadStub: sinon.SinonStub;
    let fileExistsStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.sandbox.create();
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
      cjsonLoadStub.returns({ name: "my-project", engines: { node: "8"}});
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy Firebase Functions");
    });

    it("should throw error if main is defined and that file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", main: "src/main.js", engines: { node: "8" }});
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/srcmain.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy Firebase Functions");
    });

    it.skip("should not throw error if package.json, functions file exists and engines present", () => {
      cjsonLoadStub.returns({ name: "my-project", engines: { node: "8" }});
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(true);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.not.throw;
    });
  });
});
