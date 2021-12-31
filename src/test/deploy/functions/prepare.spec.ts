import * as sinon from "sinon";
import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as prepare from "../../../deploy/functions/prepare";
import * as secretManager from "../../../gcp/secretManager";
import { defaultServiceAccount } from "../../../gcp/cloudfunctions";
import { FirebaseError } from "../../../error";

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
          eventFilters: {
            bucket: "bucket",
          },
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
          eventFilters: {
            bucket: "us-bucket",
          },
          retry: false,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const have: backend.Endpoint & backend.EventTriggered = JSON.parse(JSON.stringify(want));
      have.eventTrigger.eventFilters["bucket"] = "us-central1-bucket";
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
  });

  describe("validateSecrets", () => {
    const projectId = "project";
    const secret: secretManager.Secret = { projectId, name: "MY_SECRET" };

    let secretVersionStub: sinon.SinonStub;

    beforeEach(() => {
      secretVersionStub = sinon.stub(secretManager, "getSecretVersion").rejects("Unexpected call");
    });

    afterEach(() => {
      secretVersionStub.restore();
    });

    it("passes validation with empty backend", () => {
      expect(prepare.validateSecrets(backend.empty())).to.not.be.rejected;
    });

    it("passes validation with no secret env vars", () => {
      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv2",
      });
      expect(prepare.validateSecrets(b)).to.not.be.rejected;
    });

    it("fails validation given endpoint with secrets targeting unsupported platform", () => {
      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv2",
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
          },
        ],
      });

      expect(prepare.validateSecrets(b)).to.be.rejectedWith(FirebaseError);
    });

    it("fails validation given non-existent secret version", () => {
      secretVersionStub.rejects({ reason: "Secret version does not exist" });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
          },
        ],
      });
      expect(prepare.validateSecrets(b)).to.be.rejectedWith(FirebaseError);
    });

    it("fails validation given disabled secret version", () => {
      secretVersionStub.resolves({
        secret,
        version: "1",
        state: "DISABLED",
      });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
          },
        ],
      });
      expect(prepare.validateSecrets(b)).to.be.rejectedWith(FirebaseError, /DISABLED/);
    });

    it("passes validation given valid secret config", () => {
      secretVersionStub.withArgs(projectId, secret.name, "3").resolves({
        secret,
        version: "3",
        state: "ENABLED",
      });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
            version: "3",
          },
        ],
      });
      expect(prepare.validateSecrets(b)).to.not.be.rejected;
    });

    it("passes validation and resolves latest version given valid secret config", async () => {
      secretVersionStub.withArgs(projectId, secret.name, "latest").resolves({
        secret,
        version: "2",
        state: "ENABLED",
      });

      const b = backend.of({
        ...ENDPOINT,
        platform: "gcfv1",
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
          },
        ],
      });

      await prepare.validateSecrets(b);
      expect(backend.allEndpoints(b)[0].secretEnvironmentVariables![0].version).to.equal("2");
    });
  });

  describe("ensureSecretAccess", () => {
    const project0 = "project-0";
    const project1 = "project-1";
    const secret0: backend.SecretEnvVar = {
      projectId: project0,
      key: "MY_SECRET_0",
      secret: "MY_SECRET_0",
      version: "2",
    };
    const secret1: backend.SecretEnvVar = {
      projectId: project1,
      key: "MY_SECRET_1",
      secret: "MY_SECRET_1",
      version: "2",
    };

    const e: backend.Endpoint = {
      ...ENDPOINT,
      project: project0,
      platform: "gcfv1",
      secretEnvironmentVariables: [],
    };

    let secretManagerMock: sinon.SinonMock;

    beforeEach(() => {
      secretManagerMock = sinon.mock(secretManager);
    });

    afterEach(() => {
      secretManagerMock.verify();
      secretManagerMock.restore();
    });

    it("ensures access to default service account", async () => {
      const b = backend.of({
        ...e,
        secretEnvironmentVariables: [secret0],
      });
      secretManagerMock
        .expects("ensureServiceAgentRole")
        .once()
        .withExactArgs(
          { name: secret0.secret, projectId: project0 },
          [defaultServiceAccount(e.project)],
          "roles/secretmanager.secretAccessor"
        );
      await prepare.ensureSecretAccess(b);
    });

    it("ensures access to all secrets", async () => {
      const b = backend.of({
        ...e,
        secretEnvironmentVariables: [secret0, secret1],
      });
      secretManagerMock.expects("ensureServiceAgentRole").twice();
      await prepare.ensureSecretAccess(b);
    });

    it("combines service account to make one call per secret", async () => {
      const b = backend.of(
        {
          ...e,
          secretEnvironmentVariables: [secret0],
        },
        {
          ...e,
          id: "another-id",
          serviceAccountEmail: "foo@bar.com",
          secretEnvironmentVariables: [secret0],
        }
      );
      secretManagerMock
        .expects("ensureServiceAgentRole")
        .once()
        .withExactArgs(
          { name: secret0.secret, projectId: project0 },
          [`${e.project}@appspot.gserviceaccount.com`, "foo@bar.com"],
          "roles/secretmanager.secretAccessor"
        );
      await prepare.ensureSecretAccess(b);
    });
  });
});
