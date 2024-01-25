import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";

import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { configstore } from "../../../configstore";
import { POLL_SETTINGS } from "../../../ensureApiEnabled";
import * as api from "../../../api";
import * as backend from "../../../deploy/functions/backend";
import * as ensure from "../../../deploy/functions/ensure";
import * as secretManager from "../../../gcp/secretManager";

describe("ensureCloudBuildEnabled()", () => {
  let restoreInterval: number;
  before(() => {
    restoreInterval = POLL_SETTINGS.pollInterval;
    POLL_SETTINGS.pollInterval = 0;
  });
  after(() => {
    POLL_SETTINGS.pollInterval = restoreInterval;
  });

  let sandbox: sinon.SinonSandbox;
  let logStub: sinon.SinonStub | null;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logStub = sandbox.stub(logger, "warn");
  });

  afterEach(() => {
    expect(nock.isDone()).to.be.true;
    sandbox.restore();
    timeStub = null;
    logStub = null;
  });

  function mockServiceCheck(isEnabled = false): void {
    nock(api.serviceUsageOrigin)
      .get("/v1/projects/test-project/services/cloudbuild.googleapis.com")
      .reply(200, { state: isEnabled ? "ENABLED" : "DISABLED" });
  }

  function mockServiceEnableSuccess(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(200, {});
  }

  function mockServiceEnableBillingError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          details: [{ violations: [{ type: "serviceusage/billing-enabled" }] }],
        },
      });
  }

  function mockServiceEnablePermissionError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          status: "PERMISSION_DENIED",
        },
      });
  }

  let timeStub: sinon.SinonStub | null;
  function stubTimes(warnAfter: number, errorAfter: number): void {
    timeStub = sandbox.stub(configstore, "get");
    timeStub.withArgs("motd.cloudBuildWarnAfter").returns(warnAfter);
    timeStub.withArgs("motd.cloudBuildErrorAfter").returns(errorAfter);
  }

  describe("with cloudbuild service enabled", () => {
    beforeEach(() => {
      mockServiceCheck(true);
    });

    it("should succeed", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.cloudBuildEnabled("test-project")).to.eventually.be.fulfilled;
      expect(logStub?.callCount).to.eq(0);
    });
  });

  describe("with cloudbuild service disabled, but enabling succeeds", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnableSuccess();
      mockServiceCheck(true);
    });

    it("should succeed", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.cloudBuildEnabled("test-project")).to.eventually.be.fulfilled;
      expect(logStub?.callCount).to.eq(1); // enabling an api logs a warning
    });
  });

  describe("with cloudbuild service disabled, but enabling fails with billing error", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnableBillingError();
    });

    it("should error", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.cloudBuildEnabled("test-project")).to.eventually.be.rejectedWith(
        FirebaseError,
        /must be on the Blaze \(pay-as-you-go\) plan to complete this command/,
      );
    });
  });

  describe("with cloudbuild service disabled, but enabling fails with permission error", () => {
    beforeEach(() => {
      mockServiceCheck(false);
      mockServiceEnablePermissionError();
    });

    it("should error", async () => {
      stubTimes(Date.now() - 10000, Date.now() - 5000);

      await expect(ensure.cloudBuildEnabled("test-project")).to.eventually.be.rejectedWith(
        FirebaseError,
        /Please ask a project owner to visit the following URL to enable Cloud Build/,
      );
    });
  });
});

describe("ensureSecretAccess", () => {
  const DEFAULT_SA = "default-sa@google.com";
  const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
    project: "project",
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

  const projectId = "project-0";
  const secret0: backend.SecretEnvVar = {
    projectId: "project",
    key: "MY_SECRET_0",
    secret: "MY_SECRET_0",
    version: "2",
  };
  const secret1: backend.SecretEnvVar = {
    projectId: "project",
    key: "ANOTHER_SECRET",
    secret: "ANOTHER_SECRET",
    version: "1",
  };
  const e: backend.Endpoint = {
    ...ENDPOINT,
    project: projectId,
    platform: "gcfv1",
    secretEnvironmentVariables: [],
  };

  let defaultServiceAccountStub: sinon.SinonStub;
  let secretManagerMock: sinon.SinonMock;

  beforeEach(() => {
    defaultServiceAccountStub = sinon.stub(ensure, "defaultServiceAccount").resolves(DEFAULT_SA);
    secretManagerMock = sinon.mock(secretManager);
  });

  afterEach(() => {
    defaultServiceAccountStub.restore();
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
        { name: secret0.secret, projectId: projectId },
        [DEFAULT_SA],
        "roles/secretmanager.secretAccessor",
      );
    await ensure.secretAccess(projectId, b, backend.empty());
  });

  it("ensures access to all secrets", async () => {
    const b = backend.of({
      ...e,
      secretEnvironmentVariables: [secret0, secret1],
    });
    secretManagerMock.expects("ensureServiceAgentRole").twice();
    await ensure.secretAccess(projectId, b, backend.empty());
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
        serviceAccount: "foo@bar.com",
        secretEnvironmentVariables: [secret0],
      },
    );
    secretManagerMock
      .expects("ensureServiceAgentRole")
      .once()
      .withExactArgs(
        { name: secret0.secret, projectId: projectId },
        [DEFAULT_SA, "foo@bar.com"],
        "roles/secretmanager.secretAccessor",
      );
    await ensure.secretAccess(projectId, b, backend.empty());
  });

  it("skips calling IAM if secret is already bound to a service account", async () => {
    const b = backend.of({
      ...e,
      secretEnvironmentVariables: [secret0],
    });
    secretManagerMock.expects("ensureServiceAgentRole").never();
    await ensure.secretAccess(projectId, b, b);
  });

  it("does not include service account already bounud to a secret", async () => {
    const haveEndpoint = {
      ...e,
      secretEnvironmentVariables: [secret0],
    };
    const haveBackend = backend.of(haveEndpoint);
    const wantBackend = backend.of(haveEndpoint, {
      ...e,
      id: "another-id",
      serviceAccount: "foo@bar.com",
      secretEnvironmentVariables: [secret0],
    });
    secretManagerMock
      .expects("ensureServiceAgentRole")
      .once()
      .withExactArgs(
        { name: secret0.secret, projectId: projectId },
        ["foo@bar.com"],
        "roles/secretmanager.secretAccessor",
      );
    await ensure.secretAccess(projectId, wantBackend, haveBackend);
  });
});
