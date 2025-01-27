import { expect } from "chai";

import * as backend from "./backend";
import * as prepare from "./prepare";
import { BEFORE_CREATE_EVENT, BEFORE_SIGN_IN_EVENT } from "../../functions/events/v1";
import * as sinon from "sinon";
import * as prompt from "../../prompt";
import { FirebaseError } from "../../error";

describe("prepare", () => {
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    id: "id",
    region: "region",
    project: "project",
    entryPoint: "entry",
    runtime: "nodejs16",
  };

  const ENDPOINT: backend.Endpoint = {
    ...ENDPOINT_BASE,
    httpsTrigger: {},
  };

  describe("inferDetailsFromExisting", () => {
    it("merges env vars if .env is not used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotenv= */ false);

      expect(newE.environmentVariables).to.deep.equals({
        old: "value",
        new: "value",
        foo: "new value",
      });
    });

    it("overwrites env vars if .env is used", () => {
      const oldE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "old value",
          old: "value",
        },
      };
      const newE = {
        ...ENDPOINT,
        environmentVariables: {
          foo: "new value",
          new: "value",
        },
      };

      prepare.inferDetailsFromExisting(backend.of(newE), backend.of(oldE), /* usedDotEnv= */ true);

      expect(newE.environmentVariables).to.deep.equals({
        new: "value",
        foo: "new value",
      });
    });

    it("can noop when there is no prior endpoint", () => {
      const e = { ...ENDPOINT };
      prepare.inferDetailsFromExisting(backend.of(e), backend.of(), /* usedDotEnv= */ false);
      expect(e).to.deep.equal(ENDPOINT);
    });

    it("can fill in regions from last deploy", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.region = "us";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.equal("us");
    });

    it("doesn't fill in regions if triggers changed", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalzied",
          eventFilters: { bucket: "us-bucket" },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.eventFilters = { bucket: "us-central1-bucket" };
      have.eventTrigger.region = "us-central1";

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.eventTrigger.region).to.be.undefined;
    });

    it("fills in instance size", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint = JSON.parse(JSON.stringify(want));
      have.availableMemoryMb = 512;

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* usedDotEnv= */ false);
      expect(want.availableMemoryMb).to.equal(512);
    });

    it("downgrades concurrency if necessary (explicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: 0.5,
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("downgrades concurrency if necessary (implicit)", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        concurrency: 80,
        cpu: 1,
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        cpu: "gcf_gen1",
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });

    it("upgrades default concurrency with CPU upgrades", () => {
      const have: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
        availableMemoryMb: 256,
        cpu: "gcf_gen1",
      };
      const want: backend.Endpoint = {
        ...ENDPOINT_BASE,
        httpsTrigger: {},
      };

      prepare.inferDetailsFromExisting(backend.of(want), backend.of(have), /* useDotEnv= */ false);
      prepare.resolveCpuAndConcurrency(backend.of(want));
      expect(want.concurrency).to.equal(1);
    });
  });

  describe("inferBlockingDetails", () => {
    it("should merge the blocking options and set default value", () => {
      const beforeCreate: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeCreate",
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: true,
            refreshToken: false,
          },
        },
      };
      const beforeSignIn: backend.Endpoint = {
        ...ENDPOINT_BASE,
        id: "beforeSignIn",
        blockingTrigger: {
          eventType: BEFORE_SIGN_IN_EVENT,
          options: {
            accessToken: false,
            idToken: true,
          },
        },
      };

      prepare.inferBlockingDetails(backend.of(beforeCreate, beforeSignIn));

      expect(beforeCreate.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeCreate.blockingTrigger.options?.refreshToken).to.be.false;
      expect(beforeSignIn.blockingTrigger.options?.accessToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.idToken).to.be.true;
      expect(beforeSignIn.blockingTrigger.options?.refreshToken).to.be.false;
    });
  });

  describe("updateEndpointTargetedStatus", () => {
    let endpoint1InBackend1: backend.Endpoint;
    let endpoint2InBackend1: backend.Endpoint;
    let endpoint1InBackend2: backend.Endpoint;
    let endpoint2InBackend2: backend.Endpoint;

    let backends: Record<string, backend.Backend>;

    beforeEach(() => {
      endpoint1InBackend1 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint2InBackend1 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv1",
        codebase: "backend1",
      };
      endpoint1InBackend2 = {
        ...ENDPOINT,
        id: "endpoint1",
        platform: "gcfv2",
        codebase: "backend2",
      };
      endpoint2InBackend2 = {
        ...ENDPOINT,
        id: "endpoint2",
        platform: "gcfv2",
        codebase: "backend2",
      };

      const backend1 = backend.of(endpoint1InBackend1, endpoint2InBackend1);
      const backend2 = backend.of(endpoint1InBackend2, endpoint2InBackend2);

      backends = { backend1, backend2 };
    });

    it("should mark targeted codebases", () => {
      const filters = [{ codebase: "backend1" }];
      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.true;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted codebases + ids", () => {
      const filters = [{ codebase: "backend1", idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend2.targetedByOnly).to.be.false;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });

    it("should mark targeted ids", () => {
      const filters = [{ idChunks: ["endpoint1"] }];

      // Execute
      prepare.updateEndpointTargetedStatus(backends, filters);

      // Expect
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend1.targetedByOnly).to.be.false;
      expect(endpoint1InBackend1.targetedByOnly).to.be.true;
      expect(endpoint2InBackend2.targetedByOnly).to.be.false;
    });
  });

  describe("warnIfNewGenkitFunctionIsMissingSecrets", () => {
    const nonGenkitEndpoint: backend.Endpoint = {
      id: "nonGenkit",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: "nodejs16",
      httpsTrigger: {},
    };

    const genkitEndpointWithSecrets: backend.Endpoint = {
      id: "genkitWithSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: "nodejs16",
      callableTrigger: {
        genkitAction: "action",
      },
      secretEnvironmentVariables: [
        {
          key: "SECRET",
          secret: "secret",
          projectId: "project",
        },
      ],
    };

    const genkitEndpointWithoutSecrets: backend.Endpoint = {
      id: "genkitWithoutSecrets",
      platform: "gcfv2",
      region: "us-central1",
      project: "project",
      entryPoint: "entry",
      runtime: "nodejs16",
      callableTrigger: {
        genkitAction: "action",
      },
    };

    let confirm: sinon.SinonStub<
      Parameters<typeof prompt.confirm>,
      ReturnType<typeof prompt.confirm>
    >;

    beforeEach(() => {
      confirm = sinon.stub(prompt, "confirm");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("should not prompt if there are no genkit functions", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(nonGenkitEndpoint),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if all genkit functions have secrets", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if the function is already deployed", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.of(genkitEndpointWithoutSecrets),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should not prompt if force is true", async () => {
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        { force: true } as any,
      );
      expect(confirm).to.not.be.called;
    });

    it("should throw if missing secrets and noninteractive", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          { nonInteractive: true } as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
      expect(confirm).to.have.been.calledWithMatch({ nonInteractive: true });
    });

    it("should prompt if missing secrets and interactive", async () => {
      confirm.resolves(true);
      await prepare.warnIfNewGenkitFunctionIsMissingSecrets(
        backend.empty(),
        backend.of(genkitEndpointWithoutSecrets),
        {} as any,
      );
      expect(confirm).to.be.calledOnce;
    });

    it("should throw if user declines to deploy", async () => {
      confirm.resolves(false);
      await expect(
        prepare.warnIfNewGenkitFunctionIsMissingSecrets(
          backend.empty(),
          backend.of(genkitEndpointWithoutSecrets),
          {} as any,
        ),
      ).to.be.rejectedWith(FirebaseError);
    });
  });
});
