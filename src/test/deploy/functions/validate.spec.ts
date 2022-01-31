import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as fsutils from "../../../fsutils";
import * as validate from "../../../deploy/functions/validate";
import * as projectPath from "../../../projectPath";
import * as backend from "../../../deploy/functions/backend";

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
        validate.functionsDirectoryExists("/cwd/sourceDirName", "/cwd");
      }).to.not.throw();
    });

    it("should throw error if the functions directory does not exist", () => {
      resolvePpathStub.returns("some/path/to/project");
      dirExistsStub.returns(false);

      expect(() => {
        validate.functionsDirectoryExists("/cwd/sourceDirName", "/cwd");
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
          platform: "gcfv1",
        },
        {
          id: "my-function-!@#$!@#",
          platform: "gcfv1",
        },
      ];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    it("should throw error if some function names are improperly formatted", () => {
      const functions = [
        {
          id: "my-function$%#",
          platform: "gcfv1",
        },
        {
          id: "my-function-2",
          platform: "gcfv2",
        },
      ];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    // I think it should throw error here but it doesn't error on empty or even undefined functionNames.
    // TODO(b/131331234): fix this test when validation code path is fixed.
    it.skip("should throw error on empty function names", () => {
      const functions = [{ id: "", platform: "gcfv1" }];

      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    it("should throw error on capital letters in v2 function names", () => {
      const functions = [{ id: "Hi", platform: "gcfv2" }];
      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });

    it("should throw error on underscores in v2 function names", () => {
      const functions = [{ id: "o_O", platform: "gcfv2" }];
      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.throw(FirebaseError);
    });
  });

  describe("endpointsAreValid", () => {
    const ENDPOINT_BASE: backend.Endpoint = {
      platform: "gcfv2",
      id: "id",
      region: "us-east1",
      project: "project",
      entryPoint: "func",
      runtime: "nodejs16",
      httpsTrigger: {},
    };

    it("Disallows concurrency for GCF gen 1", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "gcfv1",
        availableMemoryMb: backend.MIN_MEMORY_FOR_CONCURRENCY,
        concurrency: 2,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(/GCF gen 1/);
    });

    it("Allows endpoints with no mem and no concurrency", () => {
      expect(() => validate.endpointsAreValid(backend.of(ENDPOINT_BASE))).to.not.throw;
    });

    it("Allows endpionts with mem and no concurrency", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        availableMemoryMb: 256,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
    });

    it("Allows explicitly one concurrent", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 1,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
    });

    it("Allows endpoints with enough mem and no concurrency", () => {
      for (const mem of [2 << 10, 4 << 10, 8 << 10] as backend.MemoryOptions[]) {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          availableMemoryMb: mem,
        };
        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
      }
    });

    it("Allows endpoints with enough mem and explicit concurrency", () => {
      for (const mem of [2 << 10, 4 << 10, 8 << 10] as backend.MemoryOptions[]) {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          availableMemoryMb: mem,
          concurrency: 42,
        };
        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
      }
    });

    it("Disallows concurrency with too little memory (implicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 2,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /they have fewer than 2GB memory/
      );
    });

    it("Disallows concurrency with too little memory (explicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 2,
        availableMemoryMb: 512,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /they have fewer than 2GB memory/
      );
    });
  });
});
