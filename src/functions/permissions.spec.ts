import { expect } from "chai";
import * as sinon from "sinon";

import * as permissions from "./permissions";
import * as iam from "../gcp/iam";
import * as resourceManager from "../gcp/resourceManager";
import { FirebaseError } from "../error";
import { Policy } from "../gcp/iam";

describe("functions/permissions", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("normalizeRole", () => {
    it("should add 'roles/' prefix if missing", () => {
      expect(permissions.normalizeRole("my.custom.role")).to.equal("roles/my.custom.role");
    });

    it("should not add 'roles/' prefix if already present", () => {
      expect(permissions.normalizeRole("roles/another.role")).to.equal("roles/another.role");
    });

    it("should handle role without '.' by prefixing", () => {
      expect(permissions.normalizeRole("viewer")).to.equal("roles/viewer");
    });
  });

  describe("ensurePermissionToGrantRoles", () => {
    let testIamPermissionsStub: sinon.SinonStub;
    const projectId = "test-project-id";
    const requiredPermission = "resourcemanager.projects.setIamPolicy";

    beforeEach(() => {
      testIamPermissionsStub = sandbox.stub(iam, "testIamPermissions");
    });

    it("should resolve if user has the required permission", async () => {
      testIamPermissionsStub.resolves({ passed: true, failed: [] });
      await expect(permissions.ensurePermissionToGrantRoles(projectId)).to.eventually.be.undefined;
      expect(testIamPermissionsStub).to.have.been.calledOnceWith(projectId, [requiredPermission]);
    });

    it("should throw FirebaseError if user does not have the required permission", async () => {
      testIamPermissionsStub.resolves({ passed: false, failed: [requiredPermission] });
      await expect(permissions.ensurePermissionToGrantRoles(projectId)).to.be.rejectedWith(
        FirebaseError,
        "You do not have permission to modify IAM policies on this project.",
      );
      expect(testIamPermissionsStub).to.have.been.calledOnceWith(projectId, [requiredPermission]);
    });

    it("should throw FirebaseError if iam.testIamPermissions API call fails", async () => {
      const originalError = new Error("API call failed");
      testIamPermissionsStub.rejects(originalError);

      await expect(permissions.ensurePermissionToGrantRoles(projectId)).to.be.rejectedWith(
        FirebaseError,
        "You do not have permission to modify IAM policies on this project.",
      );
      expect(testIamPermissionsStub).to.have.been.calledOnceWith(projectId, [requiredPermission]);
    });
  });

  describe("grantRolesToServiceAccount", () => {
    let addServiceAccountToRolesStub: sinon.SinonStub;
    const projectId = "test-project-id";
    const serviceAccount = "test-sa@example.com";
    const mockPolicy: Policy = {
      version: 1,
      etag: "test-etag",
      bindings: [
        {
          role: "roles/run.invoker",
          members: [`serviceAccount:${serviceAccount}`],
        },
      ],
    };

    beforeEach(() => {
      addServiceAccountToRolesStub = sandbox.stub(resourceManager, "addServiceAccountToRoles");
    });

    it("should grant specified roles to the service account and return the updated policy", async () => {
      const rolesToGrant = ["run.invoker", "roles/storage.objectViewer"];
      const expectedNormalizedRoles = ["roles/run.invoker", "roles/storage.objectViewer"];
      addServiceAccountToRolesStub.resolves(mockPolicy);

      const result = await permissions.grantRolesToServiceAccount(
        projectId,
        serviceAccount,
        rolesToGrant,
      );

      expect(result).to.deep.equal(mockPolicy);
      expect(addServiceAccountToRolesStub).to.have.been.calledOnceWith(
        projectId,
        serviceAccount,
        expectedNormalizedRoles,
        true,
      );
    });

    it("should normalize roles before calling resourceManager", async () => {
      const rolesToGrant = ["pubsub.publisher", "cloudtasks.enqueuer"];
      const expectedNormalizedRoles = ["roles/pubsub.publisher", "roles/cloudtasks.enqueuer"];
      addServiceAccountToRolesStub.resolves(mockPolicy);

      await permissions.grantRolesToServiceAccount(projectId, serviceAccount, rolesToGrant);

      expect(addServiceAccountToRolesStub).to.have.been.calledOnceWith(
        projectId,
        serviceAccount,
        expectedNormalizedRoles,
        true,
      );
    });

    it("should throw FirebaseError if resourceManager.addServiceAccountToRoles fails", async () => {
      const rolesToGrant = ["run.invoker"];
      const normalizedRoles = ["roles/run.invoker"];
      const originalErrorMessage = "IAM update failed";
      const originalError = new Error(originalErrorMessage);
      addServiceAccountToRolesStub.rejects(originalError);

      await expect(
        permissions.grantRolesToServiceAccount(projectId, serviceAccount, rolesToGrant),
      ).to.be.rejectedWith(
        FirebaseError,
        `Failed to grant ${normalizedRoles.join(", ")} to ${serviceAccount}: ${originalErrorMessage}`,
      );
      expect(addServiceAccountToRolesStub).to.have.been.calledOnceWith(
        projectId,
        serviceAccount,
        normalizedRoles,
        true,
      );
    });

    it("should correctly list multiple roles in the error message upon failure", async () => {
      const rolesToGrant = ["run.invoker", "storage.admin", "pubsub.editor"];
      const normalizedRoles = ["roles/run.invoker", "roles/storage.admin", "roles/pubsub.editor"];
      const originalErrorMessage = "Server error";
      const originalError = new Error(originalErrorMessage);
      addServiceAccountToRolesStub.rejects(originalError);

      await expect(
        permissions.grantRolesToServiceAccount(projectId, serviceAccount, rolesToGrant),
      ).to.be.rejectedWith(
        FirebaseError,
        `Failed to grant ${normalizedRoles.join(", ")} to ${serviceAccount}: ${originalErrorMessage}`,
      );
    });
  });
});
