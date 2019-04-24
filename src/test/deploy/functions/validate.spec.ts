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
  describe(".functionsDirectoryExists", () => {
    it("should not throw error if functions directory is present", () => {
      const ppath = sinon.stub(projectPath, "resolveProjectPath");
      ppath.returns("some/path/to/project");
      const listDir = sinon.stub(fsutils, "dirExistsSync");
      listDir.returns(true);

      expect(validate.functionsDirectoryExists("cwd", "sourceDirName")).to.not.throw;
      sinon.restore();
    });

    it("should throw error if the functions directory does not exist", () => {
      const ppath = sinon.stub(projectPath, "resolveProjectPath");
      ppath.returns("some/path/to/project");
      const listDir = sinon.stub(fsutils, "dirExistsSync");
      listDir.returns(false);
      expect(() => {
        validate.functionsDirectoryExists("cwd", "sourceDirName");
      }).to.throw(FirebaseError);
      sinon.restore();
    });
  });

  describe(".functionNamesAreValid", () => {
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

  describe(".packageJsonIsValid", () => {
    it("should throw error if package.json file is missing", () => {
      const fileExists = sinon.stub(fsutils, "fileExistsSync");
      fileExists.withArgs("sourceDir/package.json").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "No npm package found");
      sinon.restore();
    });

    it("should throw error if functions source file is missing", () => {
      const cjsonStub = sinon.stub(cjson, "load");
      cjsonStub.returns({ name: "my-project" });

      const fileExists = sinon.stub(fsutils, "fileExistsSync");
      fileExists.withArgs("sourceDir/package.json").returns(true);
      fileExists.withArgs("sourceDir/index.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy Firebase Functions");
      sinon.restore();
    });

    it("should throw error if main is defined and that file is missing", () => {
      const cjsonStub = sinon.stub(cjson, "load");
      cjsonStub.returns({ name: "my-project", main: "src/main.js" });

      const fileExists = sinon.stub(fsutils, "fileExistsSync");
      fileExists.withArgs("sourceDir/package.json").returns(true);
      fileExists.withArgs("sourceDir/srcmain.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.throw(FirebaseError, "does not exist, can't deploy Firebase Functions");
      sinon.restore();
    });

    it("should not throw error if package.json and functions file exist", () => {
      const cjsonStub = sinon.stub(cjson, "load");
      cjsonStub.returns({ name: "my-project" });

      const fileExists = sinon.stub(fsutils, "fileExistsSync");
      fileExists.withArgs("sourceDir/package.json").returns(true);
      fileExists.withArgs("sourceDir/index.js").returns(true);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir");
      }).to.not.throw;
      sinon.restore();
    });
  });
});
