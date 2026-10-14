import * as sinon from "sinon";
import { expect } from "chai";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as iam from "../gcp/iam";
import * as rm from "../gcp/resourceManager";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import * as apptesting from "./ensureProjectConfigured";

describe("ensureProjectConfigured", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let serviceAccountHasRolesStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let ensureApiEnabledStub: sinon.SinonStub;
  let createServiceAccountStub: sinon.SinonStub;
  let addServiceAccountToRolesStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;

  beforeEach(() => {
    serviceAccountHasRolesStub = sandbox.stub(rm, "serviceAccountHasRoles");
    confirmStub = sandbox.stub(prompt, "confirm");
    ensureApiEnabledStub = sandbox.stub(ensureApiEnabled, "ensure");
    createServiceAccountStub = sandbox.stub(iam, "createServiceAccount");
    addServiceAccountToRolesStub = sandbox.stub(rm, "addServiceAccountToRoles");
    logWarningStub = sandbox.stub(utils, "logWarning");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  const projectId = "test-project";
  const serviceAccount = "firebaseapptesting-test-runner@test-project.iam.gserviceaccount.com";
  const TEST_RUNNER_ROLE = "roles/firebaseapptesting.testRunner";

  it("should ensure all necessary APIs are enabled", async () => {
    serviceAccountHasRolesStub.resolves(true);
    ensureApiEnabledStub.resolves();

    await apptesting.ensureProjectConfigured(projectId);

    expect(ensureApiEnabledStub).to.be.callCount(4);
    expect(ensureApiEnabledStub).to.be.calledWith(
      projectId,
      "https://firebaseapptesting.googleapis.com",
      "Firebase App Testing",
      false,
    );
    expect(ensureApiEnabledStub).to.be.calledWith(
      projectId,
      "https://run.googleapis.com",
      "Cloud Run",
      false,
    );
    expect(ensureApiEnabledStub).to.be.calledWith(
      projectId,
      "https://storage.googleapis.com",
      "Cloud Storage",
      false,
    );
    expect(ensureApiEnabledStub).to.be.calledWith(
      projectId,
      "https://artifactregistry.googleapis.com",
      "Artifact Registry",
      false,
    );
  });

  it("should do nothing if service account is already configured", async () => {
    ensureApiEnabledStub.resolves();
    serviceAccountHasRolesStub.resolves(true);

    await apptesting.ensureProjectConfigured(projectId);

    expect(serviceAccountHasRolesStub).to.be.calledWith(
      projectId,
      serviceAccount,
      [TEST_RUNNER_ROLE],
      true,
    );
    expect(confirmStub).to.not.have.been.called;
    expect(createServiceAccountStub).to.not.have.been.called;
    expect(addServiceAccountToRolesStub).to.not.have.been.called;
  });

  it("should provision service account if user confirms", async () => {
    ensureApiEnabledStub.resolves();
    serviceAccountHasRolesStub.resolves(false);
    confirmStub.resolves(true);
    createServiceAccountStub.resolves();
    addServiceAccountToRolesStub.resolves();

    await apptesting.ensureProjectConfigured(projectId);

    expect(serviceAccountHasRolesStub).to.be.calledWith(
      projectId,
      serviceAccount,
      [TEST_RUNNER_ROLE],
      true,
    );
    expect(confirmStub).to.be.calledOnce;
    expect(createServiceAccountStub).to.be.calledWith(
      projectId,
      "firebaseapptesting-test-runner",
      sinon.match.string,
      sinon.match.string,
    );
    expect(addServiceAccountToRolesStub).to.be.calledWith(
      projectId,
      serviceAccount,
      [TEST_RUNNER_ROLE],
      true,
    );
  });

  it("should throw error if user denies service account creation", async () => {
    ensureApiEnabledStub.resolves();
    serviceAccountHasRolesStub.resolves(false);
    confirmStub.resolves(false);

    await expect(apptesting.ensureProjectConfigured(projectId)).to.be.rejectedWith(
      FirebaseError,
      /Firebase App Testing requires a service account/,
    );

    expect(confirmStub).to.be.calledOnce;
    expect(createServiceAccountStub).to.not.have.been.called;
    expect(addServiceAccountToRolesStub).to.not.have.been.called;
  });

  it("should handle service account already exists error", async () => {
    ensureApiEnabledStub.resolves();
    serviceAccountHasRolesStub.resolves(false);
    confirmStub.resolves(true);
    createServiceAccountStub.rejects(new FirebaseError("Already exists", { status: 409 }));
    addServiceAccountToRolesStub.resolves();

    await apptesting.ensureProjectConfigured(projectId);

    expect(createServiceAccountStub).to.be.calledOnce;
    expect(addServiceAccountToRolesStub).to.be.calledOnce;
  });

  it("should handle addServiceAccountToRoles 400 error", async () => {
    ensureApiEnabledStub.resolves();
    serviceAccountHasRolesStub.resolves(false);
    confirmStub.resolves(true);
    createServiceAccountStub.resolves();
    addServiceAccountToRolesStub.rejects(new FirebaseError("Bad request", { status: 400 }));

    await apptesting.ensureProjectConfigured(projectId);

    expect(addServiceAccountToRolesStub).to.be.calledOnce;
    expect(logWarningStub).to.be.calledWith(
      `Your App Testing runner service account, "${serviceAccount}", is still being provisioned in the background. If you encounter an error, please try again after a few moments.`,
    );
  });
});
