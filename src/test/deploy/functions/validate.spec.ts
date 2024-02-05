import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as fsutils from "../../../fsutils";
import * as validate from "../../../deploy/functions/validate";
import * as projectPath from "../../../projectPath";
import * as secretManager from "../../../gcp/secretManager";
import * as backend from "../../../deploy/functions/backend";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../../functions/events/v1";
import { resolveCpuAndConcurrency } from "../../../deploy/functions/prepare";

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

    it("should not throw error on capital letters in v2 function names", () => {
      const functions = [{ id: "Hi", platform: "gcfv2" }];
      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.not.throw();
    });

    it("should not throw error on underscores in v2 function names", () => {
      const functions = [{ id: "o_O", platform: "gcfv2" }];
      expect(() => {
        validate.functionIdsAreValid(functions);
      }).to.not.throw();
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
        availableMemoryMb: 256,
        concurrency: 2,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(/GCF gen 1/);
    });

    it("Disallows concurrency for low-CPU gen 2", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "gcfv2",
        cpu: 1 / 6,
        concurrency: 2,
      };

      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /concurrent execution and less than one full CPU/,
      );
    });

    for (const [mem, cpu] of [
      [undefined, undefined],
      [undefined, "gcf_gen1"],
      [128, 0.1],
      [512, 0.5],
      [512, 1],
      [512, 2],
      [2048, 4],
      [4096, 6],
      [4096, 8],
    ] as const) {
      it(`does not throw for valid CPU ${cpu ?? "undefined"}`, () => {
        const want = backend.of({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          cpu,
          availableMemoryMb: mem,
        });
        expect(() => validate.endpointsAreValid(want)).to.not.throw();
      });
    }

    it("throws for gcfv1 with CPU", () => {
      const want = backend.of({
        ...ENDPOINT_BASE,
        platform: "gcfv1",
        cpu: 1,
      });
      expect(() => validate.endpointsAreValid(want)).to.throw();
    });

    for (const region of ["australia-southeast2", "asia-northeast3", "asia-south2"]) {
      it("disallows large CPU in low-CPU region" + region, () => {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          region,
          cpu: 6,
          availableMemoryMb: 2048,
        };

        expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
          /have > 4 CPU in a region that supports a maximum 4 CPU/,
        );
      });
    }

    for (const [mem, cpu] of [
      [128, 0.08],
      [512, 0.5],
      [1024, 1],
      [2048, 2],
      [2048, 4],
      [4096, 6],
      [4096, 8],
      [1024, "gcf_gen1"],
    ] as const) {
      it(`allows valid CPU size ${cpu}`, () => {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          region: "us-west1",
          cpu: cpu,
          availableMemoryMb: mem,
        };

        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw();
      });
    }

    for (const [mem, cpu] of [
      // < 0.08
      [128, 0.07],
      // fractional > 1
      [512, 1.1],
      // odd
      [1024, 3],
      [2048, 5],
      [2048, 7],
      // too large
      [4096, 9],
    ] as const) {
      it(`disallows CPU size ${cpu}`, () => {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          cpu,
          availableMemoryMb: mem,
        };

        expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
          /Valid CPU options are \(0.08, 1], 2, 4, 6, 8, or "gcf_gen1"/,
        );
      });
    }

    it("disallows tiny CPU with large memory", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "gcfv2",
        cpu: 0.49,
        availableMemoryMb: 1024,
      };

      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /A minimum of 0.5 CPU is needed to set a memory limit greater than 512MiB/,
      );
    });

    it("disallows small CPU with huge memory", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        platform: "gcfv2",
        cpu: 0.99,
        availableMemoryMb: 2048,
      };

      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /A minimum of 1 CPU is needed to set a memory limit greater than 1GiB/,
      );
    });

    for (const [mem, cpu] of [
      [1024, 4],
      [2048, 6],
      [2048, 8],
    ] as const) {
      it(`enforces minimum memory for ${cpu} CPU`, () => {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          cpu,
          availableMemoryMb: mem,
        };

        expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
          /too little memory for their CPU/,
        );
      });
    }

    for (const mem of [128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768] as const) {
      it(`allows gcfv2 endpoints with mem ${mem} and no cpu`, () => {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          availableMemoryMb: mem,
        };
        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw();
      });
    }

    it("allows endpoints with no mem and no concurrency", () => {
      expect(() => validate.endpointsAreValid(backend.of(ENDPOINT_BASE))).to.not.throw();
    });

    it("allows endpoints with mem and no concurrency", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        availableMemoryMb: 256,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw();
    });

    it("allows explicitly one concurrent", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 1,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw();
    });

    it("allows endpoints with enough mem and no concurrency", () => {
      for (const mem of [2 << 10, 4 << 10, 8 << 10] as backend.MemoryOptions[]) {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          availableMemoryMb: mem,
          cpu: "gcf_gen1",
        };
        resolveCpuAndConcurrency(backend.of(ep));
        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
      }
    });

    it("allows endpoints with enough mem and explicit concurrency", () => {
      for (const mem of [2 << 10, 4 << 10, 8 << 10] as backend.MemoryOptions[]) {
        const ep: backend.Endpoint = {
          ...ENDPOINT_BASE,
          availableMemoryMb: mem,
          cpu: "gcf_gen1",
          concurrency: 42,
        };
        resolveCpuAndConcurrency(backend.of(ep));
        expect(() => validate.endpointsAreValid(backend.of(ep))).to.not.throw;
      }
    });

    it("disallows concurrency with too little memory (implicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        availableMemoryMb: 256,
        concurrency: 2,
        cpu: "gcf_gen1",
      };
      resolveCpuAndConcurrency(backend.of(ep));
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /concurrent execution and less than one full CPU/,
      );
    });

    it("Disallows concurrency with too little cpu (explicit)", () => {
      const ep: backend.Endpoint = {
        ...ENDPOINT_BASE,
        concurrency: 2,
        cpu: 0.5,
      };
      expect(() => validate.endpointsAreValid(backend.of(ep))).to.throw(
        /concurrent execution and less than one full CPU/,
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
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_CREATE_EVENT} events`,
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
        `Can only create at most one Auth Blocking Trigger for ${BEFORE_SIGN_IN_EVENT} events`,
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
        { ...ENDPOINT_BASE, id: "i2", region: "r1" },
      );
      const b2 = backend.of(
        { ...ENDPOINT_BASE, id: "i3", region: "r2" },
        { ...ENDPOINT_BASE, id: "i4", region: "r2" },
      );
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.not.throw();
    });

    it("passes given unique id, region pairs", () => {
      const b1 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r1" },
        { ...ENDPOINT_BASE, id: "i2", region: "r1" },
      );
      const b2 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r2" },
        { ...ENDPOINT_BASE, id: "i2", region: "r2" },
      );
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.not.throw();
    });

    it("throws given non-unique id region pairs", () => {
      const b1 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b2 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      expect(() => validate.endpointsAreUnique({ b1, b2 })).to.throw(
        /projects\/project\/locations\/r1\/functions\/i1: b1,b2/,
      );
    });

    it("throws given non-unique id region pairs across all codebases", () => {
      const b1 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b2 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      const b3 = backend.of({ ...ENDPOINT_BASE, id: "i1", region: "r1" });
      expect(() => validate.endpointsAreUnique({ b1, b2, b3 })).to.throw(
        /projects\/project\/locations\/r1\/functions\/i1: b1,b2,b3/,
      );
    });

    it("throws given multiple conflicts", () => {
      const b1 = backend.of(
        { ...ENDPOINT_BASE, id: "i1", region: "r1" },
        { ...ENDPOINT_BASE, id: "i2", region: "r2" },
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
      expect(validate.secretsAreValid(project, b)).to.be.rejectedWith(
        FirebaseError,
        /Failed to validate secret version/,
      );
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
      expect(validate.secretsAreValid(project, b)).to.be.rejectedWith(
        FirebaseError,
        /Failed to validate secret versions/,
      );
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
      expect(validate.secretsAreValid(project, b)).to.be.rejectedWith(
        FirebaseError,
        /Failed to validate secret versions/,
      );
    });

    it("passes validation and resolves latest version given valid secret config", async () => {
      secretVersionStub.withArgs(project, secret.name, "latest").resolves({
        secret,
        versionId: "2",
        state: "ENABLED",
      });

      for (const platform of ["gcfv1" as const, "gcfv2" as const]) {
        const b = backend.of({
          ...ENDPOINT,
          platform,
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
      }
    });
  });
});
