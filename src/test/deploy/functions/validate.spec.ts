import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import { RUNTIME_NOT_SET } from "../../../deploy/functions/parseRuntimeAndValidateSDK";
import { FunctionSpec } from "../../../deploy/functions/backend";
import * as fsutils from "../../../fsutils";
import * as validate from "../../../deploy/functions/validate";
import * as projectPath from "../../../projectPath";

// have to require this because no @types/cjson available
// eslint-disable-next-line
const cjson = require("cjson");

describe("validate", () => {
  describe("functionsDirectoryExists", () => {
    const sandbox: sinon.SinonSandbox = sinon.createSandbox();
    let resolvePpathStub: sinon.SinonStub;
    let dirExistsStub: sinon.SinonStub;

    beforeEach(() => {
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
        validate.functionsDirectoryExists({ cwd: "cwd" }, "sourceDirName");
      }).to.not.throw();
    });

    it("should throw error if the functions directory does not exist", () => {
      resolvePpathStub.returns("some/path/to/project");
      dirExistsStub.returns(false);

      expect(() => {
        validate.functionsDirectoryExists({ cwd: "cwd" }, "sourceDirName");
      }).to.throw(FirebaseError);
    });
  });

  describe("functionNamesAreValid", () => {
    it("should allow properly formatted function names", () => {
      const functions: any[] = [
        {
          id: "my-function-1",
        },
        {
          id: "my-function-2",
        },
      ];
      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.not.throw();
    });

    it("should throw error on improperly formatted function names", () => {
      const functions = [
        {
          id: "my-function-!@#$%",
        },
        {
          id: "my-function-!@#$!@#",
        },
      ];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    it("should throw error if some function names are improperly formatted", () => {
      const functions = [{ id: "my-function$%#" }, { id: "my-function-2" }];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    // I think it should throw error here but it doesn't error on empty or even undefined functionNames.
    // TODO(b/131331234): fix this test when validation code path is fixed.
    it.skip("should throw error on empty function names", () => {
      const functions = [{ id: "" }];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });
  });

  describe("checkForInvalidChangeOfTrigger", () => {
    const CLOUD_FUNCTION: Omit<FunctionSpec, "trigger"> = {
      apiVersion: 1,
      id: "my-func",
      region: "us-central1",
      project: "project",
      runtime: "nodejs14",
      entryPoint: "function",
    };
    it("should throw if a https function would be changed into an event triggered function", () => {
      const fn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {},
          retry: false,
        },
      };
      const exFn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger: {
          allowInsecure: true,
        },
      };

      expect(() => {
        validate.checkForInvalidChangeOfTrigger(fn, exFn);
      }).to.throw();
    });

    it("should throw if a event triggered function would be changed into an https function", () => {
      const fn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger: {
          allowInsecure: true,
        },
      };
      const exFn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {},
          retry: false,
        },
      };

      expect(() => {
        validate.checkForInvalidChangeOfTrigger(fn, exFn);
      }).to.throw();
    });

    it("should not throw if a event triggered function keeps the same trigger", () => {
      const trigger = {
        eventType: "google.pubsub.topic.publish",
        eventFilters: {},
        retry: false,
      };
      const fn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger,
      };
      const exFn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger,
      };

      expect(() => {
        validate.checkForInvalidChangeOfTrigger(fn, exFn);
      }).not.to.throw();
    });

    it("should not throw if a https function stays as a https function", () => {
      const trigger = { allowInsecure: true };
      const fn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger,
      };
      const exFn: FunctionSpec = {
        ...CLOUD_FUNCTION,
        trigger,
      };

      expect(() => {
        validate.checkForInvalidChangeOfTrigger(fn, exFn);
      }).not.to.throw();
    });
  });

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
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
      }).to.throw(FirebaseError, "No npm package found");
    });

    it("should throw error if functions source file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should throw error if main is defined and that file is missing", () => {
      cjsonLoadStub.returns({ name: "my-project", main: "src/main.js", engines: { node: "8" } });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/src/main.js").returns(false);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
      }).to.throw(FirebaseError, "does not exist, can't deploy");
    });

    it("should not throw error if runtime is set in the config and the engines field is not set", () => {
      cjsonLoadStub.returns({ name: "my-project" });
      fileExistsStub.withArgs("sourceDir/package.json").returns(true);
      fileExistsStub.withArgs("sourceDir/index.js").returns(true);

      expect(() => {
        validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", true);
      }).to.not.throw();
    });

    context("runtime is not set in the config", () => {
      it("should throw error if runtime is not set in the config and the engines field is not set", () => {
        cjsonLoadStub.returns({ name: "my-project" });
        fileExistsStub.withArgs("sourceDir/package.json").returns(true);
        fileExistsStub.withArgs("sourceDir/index.js").returns(true);

        expect(() => {
          validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
        }).to.throw(FirebaseError, RUNTIME_NOT_SET);
      });

      it("should throw error if engines field is set but node field missing", () => {
        cjsonLoadStub.returns({ name: "my-project", engines: {} });
        fileExistsStub.withArgs("sourceDir/package.json").returns(true);
        fileExistsStub.withArgs("sourceDir/index.js").returns(true);

        expect(() => {
          validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
        }).to.throw(FirebaseError, RUNTIME_NOT_SET);
      });

      it("should not throw error if package.json, functions file exists and engines present", () => {
        cjsonLoadStub.returns({ name: "my-project", engines: { node: "8" } });
        fileExistsStub.withArgs("sourceDir/package.json").returns(true);
        fileExistsStub.withArgs("sourceDir/index.js").returns(true);

        expect(() => {
          validate.packageJsonIsValid("sourceDirName", "sourceDir", "projectDir", false);
        }).to.not.throw();
      });
    });
  });
});
