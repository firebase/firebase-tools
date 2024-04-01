import * as sinon from "sinon";
import { expect } from "chai";

import * as iam from "../../../gcp/iam";
import * as secretManager from "../../../gcp/secretManager";
import { grantSecretAccess } from "../../../init/features/apphosting/secrets";
import { FirebaseError } from "../../../error";

describe("manageSecrets", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let secretExistsStub: sinon.SinonStub;
  let getIamPolicyStub: sinon.SinonStub;
  let setIamPolicyStub: sinon.SinonStub;

  beforeEach(() => {
    secretExistsStub = sandbox
      .stub(secretManager, "secretExists")
      .throws("Unexpected secretExists call");
    getIamPolicyStub = sandbox
      .stub(secretManager, "getIamPolicy")
      .throws("Unexpected getIamPolicy call");
    setIamPolicyStub = sandbox
      .stub(secretManager, "setIamPolicy")
      .throws("Unexpected setIamPolicy call");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
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
          members: [`serviceAccount:${iam.getDefaultComputeEngineServiceAgent(projectNumber)}`],
        },
      ],
    };

    it("should grant access to the appropriate service accounts", async () => {
      secretExistsStub.resolves(true);
      getIamPolicyStub.resolves(existingPolicy);
      setIamPolicyStub.resolves();

      await grantSecretAccess(secretName, location, backendId, projectId, projectNumber);

      const secret = {
        projectId: projectId,
        name: secretName,
      };

      const newBindings: iam.Binding[] = [
        {
          role: "roles/viewer",
          members: [`serviceAccount:${iam.getDefaultComputeEngineServiceAgent(projectNumber)}`],
        },
        {
          role: "roles/secretmanager.secretAccessor",
          members: [
            `serviceAccount:${iam.getDefaultCloudBuildServiceAgent(projectNumber)}`,
            `serviceAccount:${iam.getDefaultComputeEngineServiceAgent(projectNumber)}`,
          ],
        },
        {
          role: "roles/secretmanager.viewer",
          members: [`serviceAccount:${iam.getDefaultCloudBuildServiceAgent(projectNumber)}`],
        },
      ];

      expect(secretExistsStub).to.be.calledWith(projectId, secretName);
      expect(getIamPolicyStub).to.be.calledWith(secret);
      expect(setIamPolicyStub).to.be.calledWith(secret, newBindings);
    });

    it("does not grant access to a secret that doesn't exist", () => {
      secretExistsStub.resolves(false);

      expect(
        grantSecretAccess(secretName, location, backendId, projectId, projectNumber),
      ).to.be.rejectedWith(
        FirebaseError,
        `Secret ${secretName} does not exist in project ${projectId}`,
      );

      expect(secretExistsStub).to.be.calledWith(projectId, secretName);
      expect(secretExistsStub).to.be.calledOnce;
      expect(setIamPolicyStub).to.not.have.been.called;
    });
  });
});
