import * as sinon from "sinon";
import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as prepare from "../../../deploy/functions/prepare";
import * as secretManager from "../../../gcp/secretManager";
import { defaultServiceAccount } from "../../../gcp/cloudfunctions";
import { FirebaseError } from "../../../error";
import { ensureAccesses, resolveVersions } from "../../../deploy/functions/prepare";

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

  describe("prepareSecrets", () => {
    describe("validateSecrets", () => {
      it("passes validation with empty backend", () => {
        const b = backend.empty();

        expect(() => prepare.validateSecrets(b)).to.not.throw();
      });

      it("passes validation with no secret env vars", () => {
        const b = backend.of({
          ...ENDPOINT,
          platform: "gcfv2",
        });

        expect(() => prepare.validateSecrets(b)).to.not.throw();
      });

      it("passes validation with a valid secret env var on a gcfv1 endpoint", () => {
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

        expect(() => prepare.validateSecrets(b)).to.not.throw();
      });

      it("fails validation for unsupported platform", () => {
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

        expect(() => prepare.validateSecrets(b)).to.throw(
          FirebaseError,
          /Only GCFv1 supports secret environments/
        );
      });
    });

    describe("resolveVersions", () => {
      let secretVersionStub: sinon.SinonStub;

      beforeEach(() => {
        secretVersionStub = sinon
          .stub(secretManager, "getSecretVersion")
          .rejects("Unexpected call");
      });

      afterEach(() => {
        secretVersionStub.restore();
      });

      const projectId = "project";
      const secret: secretManager.Secret = { projectId, name: "my-secret" };

      it("fills in missing version id", async () => {
        secretVersionStub
          .withArgs(projectId, secret.name, "latest")
          .resolves({ secret, version: "1" });
        const e: backend.Endpoint = {
          ...ENDPOINT,
          platform: "gcfv1",
          secretEnvironmentVariables: [
            {
              projectId,
              secret: secret.name,
              key: secret.name,
            },
          ],
        };
        await resolveVersions(backend.of(e));
        expect(e.secretEnvironmentVariables).to.be.deep.equal([
          {
            projectId,
            secret: secret.name,
            key: secret.name,
            version: "1",
          },
        ]);
      });

      it("skips api call if version id already exists", async () => {
        const e: backend.Endpoint = {
          ...ENDPOINT,
          platform: "gcfv1",
          secretEnvironmentVariables: [
            {
              projectId,
              secret: secret.name,
              key: secret.name,
              version: "1",
            },
          ],
        };
        await resolveVersions(backend.of(e));
        expect(e.secretEnvironmentVariables).to.be.deep.equal([
          {
            projectId,
            version: "1",
            secret: secret.name,
            key: secret.name,
          },
        ]);
      });
    });

    describe("ensureAccesses", () => {
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
        await ensureAccesses(b);
      });

      it("ensures access to all secrets", async () => {
        const b = backend.of({
          ...e,
          secretEnvironmentVariables: [secret0, secret1],
        });
        secretManagerMock.expects("ensureServiceAgentRole").twice();
        await ensureAccesses(b);
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
        await ensureAccesses(b);
      });
    });
  });
});
