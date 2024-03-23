import * as sinon from "sinon";
import { expect } from "chai";

import * as secretManager from "../../gcp/secretManager";
import * as gcf from "../../gcp/cloudfunctions";
import * as secrets from "../../functions/secrets";
import * as utils from "../../utils";
import * as prompt from "../../prompt";
import * as backend from "../../deploy/functions/backend";
import * as poller from "../../operation-poller";
import { Options } from "../../options";
import { FirebaseError } from "../../error";
import { updateEndpointSecret } from "../../functions/secrets";

const ENDPOINT = {
  id: "id",
  region: "region",
  project: "project",
  entryPoint: "id",
  runtime: "nodejs16",
  platform: "gcfv1" as const,
  httpsTrigger: {},
};

describe("functions/secret", () => {
  const options = { force: false } as Options;

  describe("ensureValidKey", () => {
    let warnStub: sinon.SinonStub;
    let promptStub: sinon.SinonStub;

    beforeEach(() => {
      warnStub = sinon.stub(utils, "logWarning").resolves(undefined);
      promptStub = sinon.stub(prompt, "promptOnce").resolves(true);
    });

    afterEach(() => {
      warnStub.restore();
      promptStub.restore();
    });

    it("returns the original key if it follows convention", async () => {
      expect(await secrets.ensureValidKey("MY_SECRET_KEY", options)).to.equal("MY_SECRET_KEY");
      expect(warnStub).to.not.have.been.called;
    });

    it("returns the transformed key (with warning) if with dashes", async () => {
      expect(await secrets.ensureValidKey("MY-SECRET-KEY", options)).to.equal("MY_SECRET_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("returns the transformed key (with warning) if with periods", async () => {
      expect(await secrets.ensureValidKey("MY.SECRET.KEY", options)).to.equal("MY_SECRET_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("returns the transformed key (with warning) if with lower cases", async () => {
      expect(await secrets.ensureValidKey("my_secret_key", options)).to.equal("MY_SECRET_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("returns the transformed key (with warning) if camelCased", async () => {
      expect(await secrets.ensureValidKey("mySecretKey", options)).to.equal("MY_SECRET_KEY");
      expect(warnStub).to.have.been.calledOnce;
    });

    it("throws error if given non-conventional key w/ forced option", () => {
      expect(secrets.ensureValidKey("throwError", { ...options, force: true })).to.be.rejectedWith(
        FirebaseError,
      );
    });

    it("throws error if given reserved key", () => {
      expect(secrets.ensureValidKey("FIREBASE_CONFIG", options)).to.be.rejectedWith(FirebaseError);
    });
  });

  describe("ensureSecret", () => {
    const secret: secretManager.Secret = {
      projectId: "project-id",
      name: "MY_SECRET",
      labels: secrets.labels(),
    };

    let sandbox: sinon.SinonSandbox;
    let getStub: sinon.SinonStub;
    let createStub: sinon.SinonStub;
    let patchStub: sinon.SinonStub;
    let promptStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();

      getStub = sandbox.stub(secretManager, "getSecret").rejects("Unexpected call");
      createStub = sandbox.stub(secretManager, "createSecret").rejects("Unexpected call");
      patchStub = sandbox.stub(secretManager, "patchSecret").rejects("Unexpected call");

      promptStub = sandbox.stub(prompt, "promptOnce").resolves(true);
      warnStub = sandbox.stub(utils, "logWarning").resolves(undefined);
    });

    afterEach(() => {
      sandbox.verifyAndRestore();
    });

    it("returns existing secret if we have one", async () => {
      getStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options),
      ).to.eventually.deep.equal(secret);
      expect(getStub).to.have.been.calledOnce;
    });

    it("prompt user to have Firebase manage the secret if not managed by Firebase", async () => {
      getStub.resolves({ ...secret, labels: [] });
      patchStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options),
      ).to.eventually.deep.equal(secret);
      expect(warnStub).to.have.been.calledOnce;
      expect(promptStub).to.have.been.calledOnce;
    });

    it("does not prompt user to have Firebase manage the secret if already managed by Firebase", async () => {
      getStub.resolves({ ...secret, labels: secrets.labels() });
      patchStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options),
      ).to.eventually.deep.equal(secret);
      expect(warnStub).not.to.have.been.calledOnce;
      expect(promptStub).not.to.have.been.calledOnce;
    });

    it("creates a new secret if it doesn't exists", async () => {
      getStub.rejects({ status: 404 });
      createStub.resolves(secret);

      await expect(
        secrets.ensureSecret("project-id", "MY_SECRET", options),
      ).to.eventually.deep.equal(secret);
    });

    it("throws if it cannot reach Secret Manager", async () => {
      getStub.rejects({ status: 500 });

      await expect(secrets.ensureSecret("project-id", "MY_SECRET", options)).to.eventually.be
        .rejected;
    });
  });

  describe("of", () => {
    function makeSecret(name: string, version?: string): backend.SecretEnvVar {
      return {
        projectId: "project",
        key: name,
        secret: name,
        version: version ?? "1",
      };
    }

    it("returns empty list given empty list", () => {
      expect(secrets.of([])).to.be.empty;
    });

    it("collects all secret environment variables", () => {
      const secret1 = makeSecret("SECRET1");
      const secret2 = makeSecret("SECRET2");
      const secret3 = makeSecret("SECRET3");

      const endpoints: backend.Endpoint[] = [
        {
          ...ENDPOINT,
          secretEnvironmentVariables: [secret1],
        },
        ENDPOINT,
        {
          ...ENDPOINT,
          secretEnvironmentVariables: [secret2, secret3],
        },
      ];
      expect(secrets.of(endpoints)).to.have.members([secret1, secret2, secret3]);
      expect(secrets.of(endpoints)).to.have.length(3);
    });
  });

  describe("getSecretVersions", () => {
    function makeSecret(name: string, version?: string): backend.SecretEnvVar {
      const secret: backend.SecretEnvVar = {
        projectId: "project",
        key: name,
        secret: name,
      };
      if (version) {
        secret.version = version;
      }
      return secret;
    }

    it("returns object mapping secrets and their versions", () => {
      const secret1 = makeSecret("SECRET1", "1");
      const secret2 = makeSecret("SECRET2", "100");
      const secret3 = makeSecret("SECRET3", "2");

      const endpoint = {
        ...ENDPOINT,
        secretEnvironmentVariables: [secret1, secret2, secret3],
      };

      expect(secrets.getSecretVersions(endpoint)).to.deep.eq({
        [secret1.secret]: secret1.version,
        [secret2.secret]: secret2.version,
        [secret3.secret]: secret3.version,
      });
    });
  });

  describe("pruneSecrets", () => {
    let listSecretsStub: sinon.SinonStub;
    let listSecretVersionsStub: sinon.SinonStub;
    let getSecretVersionStub: sinon.SinonStub;

    const secret1: secretManager.Secret = {
      projectId: "project",
      name: "MY_SECRET1",
    };
    const secretVersion11: secretManager.SecretVersion = {
      secret: secret1,
      versionId: "1",
    };
    const secretVersion12: secretManager.SecretVersion = {
      secret: secret1,
      versionId: "2",
    };

    const secret2: secretManager.Secret = {
      projectId: "project",
      name: "MY_SECRET2",
    };
    const secretVersion21: secretManager.SecretVersion = {
      secret: secret2,
      versionId: "1",
    };

    function toSecretEnvVar(sv: secretManager.SecretVersion): backend.SecretEnvVar {
      return {
        projectId: "project",
        version: sv.versionId,
        secret: sv.secret.name,
        key: sv.secret.name,
      };
    }

    beforeEach(() => {
      listSecretsStub = sinon.stub(secretManager, "listSecrets").rejects("Unexpected call");
      listSecretVersionsStub = sinon
        .stub(secretManager, "listSecretVersions")
        .rejects("Unexpected call");
      getSecretVersionStub = sinon
        .stub(secretManager, "getSecretVersion")
        .rejects("Unexpected call");
    });

    afterEach(() => {
      listSecretsStub.restore();
      listSecretVersionsStub.restore();
      getSecretVersionStub.restore();
    });

    it("returns nothing if unused", async () => {
      listSecretsStub.resolves([]);

      await expect(
        secrets.pruneSecrets({ projectId: "project", projectNumber: "12345" }, []),
      ).to.eventually.deep.equal([]);
    });

    it("returns all secrets given no endpoints", async () => {
      listSecretsStub.resolves([secret1, secret2]);
      listSecretVersionsStub.onFirstCall().resolves([secretVersion11, secretVersion12]);
      listSecretVersionsStub.onSecondCall().resolves([secretVersion21]);

      const pruned = await secrets.pruneSecrets(
        { projectId: "project", projectNumber: "12345" },
        [],
      );

      expect(pruned).to.have.deep.members(
        [secretVersion11, secretVersion12, secretVersion21].map(toSecretEnvVar),
      );
      expect(pruned).to.have.length(3);
    });

    it("does not include secret version in use", async () => {
      listSecretsStub.resolves([secret1, secret2]);
      listSecretVersionsStub.onFirstCall().resolves([secretVersion11, secretVersion12]);
      listSecretVersionsStub.onSecondCall().resolves([secretVersion21]);

      const pruned = await secrets.pruneSecrets({ projectId: "project", projectNumber: "12345" }, [
        { ...ENDPOINT, secretEnvironmentVariables: [toSecretEnvVar(secretVersion12)] },
      ]);

      expect(pruned).to.have.deep.members([secretVersion11, secretVersion21].map(toSecretEnvVar));
      expect(pruned).to.have.length(2);
    });

    it("resolves 'latest' secrets and properly prunes it", async () => {
      listSecretsStub.resolves([secret1, secret2]);
      listSecretVersionsStub.onFirstCall().resolves([secretVersion11, secretVersion12]);
      listSecretVersionsStub.onSecondCall().resolves([secretVersion21]);
      getSecretVersionStub.resolves(secretVersion12);

      const pruned = await secrets.pruneSecrets({ projectId: "project", projectNumber: "12345" }, [
        {
          ...ENDPOINT,
          secretEnvironmentVariables: [{ ...toSecretEnvVar(secretVersion12), version: "latest" }],
        },
      ]);

      expect(pruned).to.have.deep.members([secretVersion11, secretVersion21].map(toSecretEnvVar));
      expect(pruned).to.have.length(2);
    });
  });

  describe("inUse", () => {
    const projectId = "project";
    const projectNumber = "12345";
    const secret: secretManager.Secret = {
      projectId,
      name: "MY_SECRET",
    };

    it("returns true if secret is in use", () => {
      expect(
        secrets.inUse({ projectId, projectNumber }, secret, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId, key: secret.name, secret: secret.name, version: "1" },
          ],
        }),
      ).to.be.true;
    });

    it("returns true if secret is in use by project number", () => {
      expect(
        secrets.inUse({ projectId, projectNumber }, secret, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId: projectNumber, key: secret.name, secret: secret.name, version: "1" },
          ],
        }),
      ).to.be.true;
    });

    it("returns false if secret is not in use", () => {
      expect(secrets.inUse({ projectId, projectNumber }, secret, ENDPOINT)).to.be.false;
    });

    it("returns false if secret of same name from another project is in use", () => {
      expect(
        secrets.inUse({ projectId, projectNumber }, secret, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId: "another-project", key: secret.name, secret: secret.name, version: "1" },
          ],
        }),
      ).to.be.false;
    });
  });

  describe("versionInUse", () => {
    const projectId = "project";
    const projectNumber = "12345";
    const sv: secretManager.SecretVersion = {
      versionId: "5",
      secret: {
        projectId,
        name: "MY_SECRET",
      },
    };

    it("returns true if secret version is in use", () => {
      expect(
        secrets.versionInUse({ projectId, projectNumber }, sv, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId, key: sv.secret.name, secret: sv.secret.name, version: "5" },
          ],
        }),
      ).to.be.true;
    });

    it("returns true if secret version is in use by project number", () => {
      expect(
        secrets.versionInUse({ projectId, projectNumber }, sv, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId: projectNumber, key: sv.secret.name, secret: sv.secret.name, version: "5" },
          ],
        }),
      ).to.be.true;
    });

    it("returns false if secret version is not in use", () => {
      expect(secrets.versionInUse({ projectId, projectNumber }, sv, ENDPOINT)).to.be.false;
    });

    it("returns false if a different version of the secret is in use", () => {
      expect(
        secrets.versionInUse({ projectId, projectNumber }, sv, {
          ...ENDPOINT,
          secretEnvironmentVariables: [
            { projectId, key: sv.secret.name, secret: sv.secret.name, version: "1" },
          ],
        }),
      ).to.be.false;
    });
  });

  describe("pruneAndDestroySecrets", () => {
    let pruneSecretsStub: sinon.SinonStub;
    let destroySecretVersionStub: sinon.SinonStub;

    const projectId = "projectId";
    const projectNumber = "12345";
    const secret0: backend.SecretEnvVar = {
      projectId,
      key: "MY_SECRET",
      secret: "MY_SECRET",
      version: "1",
    };
    const secret1: backend.SecretEnvVar = {
      projectId,
      key: "MY_SECRET",
      secret: "MY_SECRET",
      version: "1",
    };

    beforeEach(() => {
      pruneSecretsStub = sinon.stub(secrets, "pruneSecrets").rejects("Unexpected call");
      destroySecretVersionStub = sinon
        .stub(secretManager, "destroySecretVersion")
        .rejects("Unexpected call");
    });

    afterEach(() => {
      pruneSecretsStub.restore();
      destroySecretVersionStub.restore();
    });

    it("destroys pruned secrets", async () => {
      pruneSecretsStub.resolves([secret1]);
      destroySecretVersionStub.resolves();

      await expect(
        secrets.pruneAndDestroySecrets({ projectId, projectNumber }, [
          {
            ...ENDPOINT,
            secretEnvironmentVariables: [secret0],
          },
          {
            ...ENDPOINT,
            secretEnvironmentVariables: [secret1],
          },
        ]),
      ).to.eventually.deep.equal({ erred: [], destroyed: [secret1] });
    });

    it("collects errors", async () => {
      pruneSecretsStub.resolves([secret0, secret1]);
      destroySecretVersionStub.onFirstCall().resolves();
      destroySecretVersionStub.onSecondCall().rejects({ message: "an error" });

      await expect(
        secrets.pruneAndDestroySecrets({ projectId, projectNumber }, [
          {
            ...ENDPOINT,
            secretEnvironmentVariables: [secret0],
          },
          {
            ...ENDPOINT,
            secretEnvironmentVariables: [secret1],
          },
        ]),
      ).to.eventually.deep.equal({ erred: [{ message: "an error" }], destroyed: [secret0] });
    });
  });

  describe("updateEndpointsSecret", () => {
    const projectId = "project";
    const projectNumber = "12345";
    const secretVersion: secretManager.SecretVersion = {
      secret: {
        projectId,
        name: "MY_SECRET",
      },
      versionId: "2",
    };

    let gcfMock: sinon.SinonMock;
    let pollerStub: sinon.SinonStub;

    beforeEach(() => {
      gcfMock = sinon.mock(gcf);
      pollerStub = sinon.stub(poller, "pollOperation").rejects("Unexpected call");
    });

    afterEach(() => {
      gcfMock.verify();
      gcfMock.restore();
      pollerStub.restore();
    });

    it("returns early if secret is not in use", async () => {
      const endpoint: backend.Endpoint = {
        ...ENDPOINT,
        secretEnvironmentVariables: [],
      };

      gcfMock.expects("updateFunction").never();
      await updateEndpointSecret({ projectId, projectNumber }, secretVersion, endpoint);
    });

    it("updates function with the version of the given secret", async () => {
      const sev: backend.SecretEnvVar = {
        projectId: projectNumber,
        secret: secretVersion.secret.name,
        key: secretVersion.secret.name,
        version: "1",
      };
      const endpoint: backend.Endpoint = {
        ...ENDPOINT,
        secretEnvironmentVariables: [sev],
      };
      const fn: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
        name: `projects/${endpoint.project}/locations/${endpoint.region}/functions/${endpoint.id}`,
        runtime: endpoint.runtime,
        entryPoint: endpoint.entryPoint,
        secretEnvironmentVariables: [{ ...sev, version: "2" }],
      };

      pollerStub.resolves({ ...fn, httpsTrigger: {} });
      gcfMock.expects("updateFunction").once().withArgs(fn).resolves({});

      await updateEndpointSecret({ projectId, projectNumber }, secretVersion, endpoint);
    });
  });
});
