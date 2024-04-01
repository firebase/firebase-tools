import { expect } from "chai";
import * as sinon from "sinon";

import * as secrets from "../../../apphosting/secrets";
import * as iam from "../../../gcp/iam";
import * as gcb from "../../../gcp/cloudbuild";
import * as gce from "../../../gcp/computeEngine";
import * as gcsmImport from "../../../gcp/secretManager";
import * as utilsImport from "../../../utils";
import * as promptImport from "../../../prompt";
import { FirebaseError } from "../../../error";

describe("secrets", () => {
  let gcsm: sinon.SinonStubbedInstance<typeof gcsmImport>;
  let utils: sinon.SinonStubbedInstance<typeof utilsImport>;
  let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

  beforeEach(() => {
    gcsm = sinon.stub(gcsmImport);
    utils = sinon.stub(utilsImport);
    prompt = sinon.stub(promptImport);
    gcsm.isFunctionsManaged.restore();
    gcsm.labels.restore();
    gcsm.secretExists.throws("Unexpected secretExists call");
    gcsm.getIamPolicy.throws("Unexpected getIamPolicy call");
    gcsm.setIamPolicy.throws("Unexpected setIamPolicy call");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("upsertSecret", () => {
    it("errors if a user tries to change replication policies (was global)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("apphosting"),
        replication: {
          automatic: {},
        },
      });
      await expect(secrets.upsertSecret("project", "secret", "us-central1")).to.eventually.equal(
        null,
      );
      expect(utils.logLabeledError).to.have.been.calledWith(
        "apphosting",
        "Secret replication policies cannot be changed after creation",
      );
    });

    it("errors if a user tries to change replication policies (was another region)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("apphosting"),
        replication: {
          userManaged: {
            replicas: [
              {
                location: "us-west1",
              },
            ],
          },
        },
      });
      await expect(secrets.upsertSecret("project", "secret", "us-central1")).to.eventually.equal(
        null,
      );
      expect(utils.logLabeledError).to.have.been.calledWith(
        "apphosting",
        "Secret replication policies cannot be changed after creation",
      );
    });

    it("noops if a secret already exists (location set)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("apphosting"),
        replication: {
          userManaged: {
            replicas: [
              {
                location: "us-central1",
              },
            ],
          },
        },
      });
      await expect(secrets.upsertSecret("project", "secret", "us-central1")).to.eventually.equal(
        false,
      );
      expect(utils.logLabeledError).to.not.have.been.called;
    });

    it("noops if a secret already exists (automatic replication)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("apphosting"),
        replication: {
          automatic: {},
        },
      });
      await expect(secrets.upsertSecret("project", "secret")).to.eventually.equal(false);
      expect(utils.logLabeledError).to.not.have.been.called;
    });

    it("confirms before erasing functions garbage collection (choose yes)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("functions"),
        replication: {
          automatic: {},
        },
      });
      prompt.confirm.resolves(true);
      await expect(secrets.upsertSecret("project", "secret")).to.eventually.equal(false);
      expect(utils.logLabeledWarning).to.have.been.calledWith(
        "apphosting",
        "Cloud Functions for Firebase currently manages versions of secret. " +
          "Continuing will disable automatic deletion of old versions.",
      );
      expect(prompt.confirm).to.have.been.calledWithMatch({
        message: "Do you wish to continue?",
        default: false,
      });
      expect(gcsm.patchSecret).to.have.been.calledWithMatch("project", "secret", {});
    });

    it("confirms before erasing functions garbage collection (choose no)", async () => {
      gcsm.getSecret.withArgs("project", "secret").resolves({
        name: "secret",
        projectId: "project",
        labels: gcsm.labels("functions"),
        replication: {
          automatic: {},
        },
      });
      prompt.confirm.resolves(false);
      await expect(secrets.upsertSecret("project", "secret")).to.eventually.equal(null);
      expect(utils.logLabeledWarning).to.have.been.calledWith(
        "apphosting",
        "Cloud Functions for Firebase currently manages versions of secret. " +
          "Continuing will disable automatic deletion of old versions.",
      );
      expect(prompt.confirm).to.have.been.calledWithMatch({
        message: "Do you wish to continue?",
        default: false,
      });
      expect(gcsm.patchSecret).to.not.have.been.called;
    });

    it("Creates a secret if none exists", async () => {
      gcsm.getSecret.withArgs("project", "secret").rejects({ status: 404 });

      await expect(secrets.upsertSecret("project", "secret")).to.eventually.equal(true);

      expect(gcsm.createSecret).to.have.been.calledWithMatch(
        "project",
        "secret",
        gcsm.labels("apphosting"),
        undefined,
      );
    });
  });

  describe("grantSecretAccess", () => {
    const projectId = "projectId";
    const projectNumber = "123456789";
    const location = "us-central1";
    const backendId = "backendId";
    const secretName = "secretName";
    const existingPolicy: iam.Policy = {
      version: 1,
      etag: "tag",
      bindings: [
        {
          role: "roles/viewer",
          members: [`serviceAccount:${gce.getDefaultServiceAccount(projectNumber)}`],
        },
      ],
    };

    it("should grant access to the appropriate service accounts", async () => {
      gcsm.secretExists.resolves(true);
      gcsm.getIamPolicy.resolves(existingPolicy);
      gcsm.setIamPolicy.resolves();

      await secrets.grantSecretAccess(secretName, location, backendId, projectId, projectNumber);

      const secret = {
        projectId: projectId,
        name: secretName,
      };

      const newBindings: iam.Binding[] = [
        {
          role: "roles/viewer",
          members: [`serviceAccount:${gce.getDefaultServiceAccount(projectNumber)}`],
        },
        {
          role: "roles/secretmanager.secretAccessor",
          members: [
            `serviceAccount:${gcb.getDefaultServiceAccount(projectNumber)}`,
            `serviceAccount:${gce.getDefaultServiceAccount(projectNumber)}`,
          ],
        },
        {
          role: "roles/secretmanager.viewer",
          members: [`serviceAccount:${gcb.getDefaultServiceAccount(projectNumber)}`],
        },
      ];

      expect(gcsm.secretExists).to.be.calledWith(projectId, secretName);
      expect(gcsm.getIamPolicy).to.be.calledWith(secret);
      expect(gcsm.setIamPolicy).to.be.calledWith(secret, newBindings);
    });

    it("does not grant access to a secret that doesn't exist", () => {
      gcsm.secretExists.resolves(false);

      expect(
        secrets.grantSecretAccess(secretName, location, backendId, projectId, projectNumber),
      ).to.be.rejectedWith(
        FirebaseError,
        `Secret ${secretName} does not exist in project ${projectId}`,
      );

      expect(gcsm.secretExists).to.be.calledWith(projectId, secretName);
      expect(gcsm.secretExists).to.be.calledOnce;
      expect(gcsm.setIamPolicy).to.not.have.been.called;
    });
  });
});
