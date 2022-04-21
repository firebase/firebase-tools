import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as fsutils from "../../../fsutils";
import * as validate from "../../../deploy/functions/validate";
import * as projectPath from "../../../projectPath";
import * as secretManager from "../../../gcp/secretManager";
import * as backend from "../../../deploy/functions/backend";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../../functions/events/v1";

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

    it("disallows concurrency for GCF gen 1", () => {
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

    it("disallows concurrency with too little memory (implicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 2,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /they have fewer than 2GB memory/
      );
    });

    it("disallows concurrency with too little memory (explicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 2,
        availableMemoryMb: 512,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /they have fewer than 2GB memory/
      );
    });

    it("disallows multiple beforeCreate blocking", () => {
      const ep1: backend.Endpoint = {
        platform: "gcfv1",
        id: "id1",
        region: "us-east1",
        project: "project",
        entryPoint: "func1",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
      };
      const ep2: backend.Endpoint = {
        platform: "gcfv1",
        id: "id2",
        region: "us-east1",
        project: "project",
        entryPoint: "func2",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
        },
      };

      expect(() => validate.endpointsAreValid(backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_CREATE_EVENT} events`
      );
    });

    it("disallows multiple beforeSignIn blocking", () => {
      const ep1: backend.Endpoint = {
        platform: "gcfv1",
        id: "id1",
        region: "us-east1",
        project: "project",
        entryPoint: "func1",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
      };
      const ep2: backend.Endpoint = {
        platform: "gcfv1",
        id: "id2",
        region: "us-east1",
        project: "project",
        entryPoint: "func2",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
        },
      };

      expect(() => validate.endpointsAreValid(backend.of(ep1, ep2))).to.throw(
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_SIGN_IN_EVENT} events`
      );
    });

    it("Allows valid blocking functions", () => {
      const ep1: backend.Endpoint = {
        platform: "gcfv1",
        id: "id1",
        region: "us-east1",
        project: "project",
        entryPoint: "func1",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: false,
            idToken: true,
          },
        },
      };
      const ep2: backend.Endpoint = {
        platform: "gcfv1",
        id: "id2",
        region: "us-east1",
        project: "project",
        entryPoint: "func2",
        runtime: "nodejs16",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          options: {
            accessToken: true,
          },
        },
      };
      const want: backend.Backend = {
        ...backend.of(ep1, ep2),
      };

      expect(() => validate.endpointsAreValid(want)).to.not.throw();
    });
  });

  describe("endpointsAreUnqiue", () => {
    const ENDPOINT_BASE: backend.Endpoint = {
      platform: "gcfv2",
      id: "id",
      region: "us-east1",
      project: "project",
      entryPoint: "func",
      runtime: "nodejs16",
      httpsTrigger: {},
    };

    it("passes given unqiue ids", () => {
      const b1 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r1" },
        { ...ENDPOINT_BASE, id: "i2", region: "r1" }
      );
      const b2 = backend.of(
        { ...ENDPOINT_BASE, id: "i3", region: "r2" },
        { ...ENDPOINT_BASE, id: "i4", region: "r2" }
      );
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.not.throw;
    });

    it("passes given unique id, region pairs", () => {
      const b1 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r1" },
        { ...ENDPOINT_BASE, id: "i2", region: "r1" }
      );
      const b2 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r2" },
        { ...ENDPOINT_BASE, id: "i2", region: "r2" }
      );
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.not.throw;
    });

    it("throws given non-unique id region pairs", () => {
      const b1 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b2 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.throw(
        /projects\/project\/locations\/r1\/functions\/i1: b1,b2/
      );
    });

    it("throws given non-unique id region pairs across all codebases", () => {
      const b1 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b2 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b3 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      expect(() => validate.endpointsAreUnique({ b1, b2, b3 })).to.throw(
        /projects\/project\/locations\/r1\/functions\/i1: b1,b2,b3/
      );
    });

    it("throws given multiple conflicts", () => {
      const b1 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r1" },
        { ...ENDPOINT_BASE, id: "i2", region: "r2" }
      );
      const b2 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b3 = backend.of({ ...ENDPOINT_BASE, id: "i2", region: "r2" });
      expect(() => validate.endpointsAreUnique({ b1, b2, b3 })).to.throw(/b1,b2.*b1,b3/s);
    });
  });

  describe("secretsAreValid", () => {
    const project = "project";

    const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
      project,
      platform: "gcfv2",
      id: "id",
      region: "region",
      entryPoint: "entry",
      runtime: "nodejs16",
    };
    const ENDPOINT: backend.Endpoint = {
      ...ENDPOINT_BASE,
      httpsTrigger: {},
    };

    const secret: secretManager.Secret = { projectId: project, name: "MY_SECRET" };

    let secretVersionStub: sinon.SinonStub;

    beforeEach(() => {
      secretVersionStub = sinon.stub(secretManager, "getSecretVersion").rejects("Unexpected call");
    });

    afterEach(() => {
      secretVersionStub.restore();
    });

    it("passes validation with empty backend", () => {
      expect(validate.secretsAreValid(project, backend.empty())).to.not.be.rejected;
    });

    it("passes validation with no secret env vars", () => {
      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv2",
      });
      expect(validate.secretsAreValid(project, b)).to.not.be.rejected;
    });

    it("fails validation given endpoint with secrets targeting unsupported platform", () => {
      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv2",
        secretEnvironmentVariables: [
          {
            projectId: project,
            secret: "MY_SECRET",
            key: "MY_SECRET",
          },
        ],
      });

      expect(validate.secretsAreValid(project, b)).to.be.rejectedWith(FirebaseError);
    });

    it("fails validation given non-existent secret version", () => {
      secretVersionStub.rejects({ reason: "Secret version does not exist" });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            projectId: project,
            secret: "MY_SECRET",
            key: "MY_SECRET",
          },
        ],
      });
      expect(validate.secretsAreValid(project, b)).to.be.rejectedWith(FirebaseError);
    });

    it("fails validation given disabled secret version", () => {
      secretVersionStub.resolves({
        secret,
        versionId: "1",
        state: "DISABLED",
      });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            projectId: project,
            secret: "MY_SECRET",
            key: "MY_SECRET",
          },
        ],
      });
      expect(validate.secretsAreValid(project, b)).to.be.rejected;
    });

    it("passes validation and resolves latest version given valid secret config", async () => {
      secretVersionStub.withArgs(project, secret.name, "latest").resolves({
        secret,
        versionId: "2",
        state: "ENABLED",
      });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            projectId: project,
            secret: "MY_SECRET",
            key: "MY_SECRET",
          },
        ],
      });

      await validate.secretsAreValid(project, b);
      expect(backend.allEndpoints(b)[0].secretEnvironmentVariables![0].version).to.equal("2");
    });
  });
});
