import * as chai from "chai";
import * as sinon from "sinon";
import * as iam from "../gcp/iam";
import * as resourceManager from "../gcp/resourceManager";
import * as cloudSqlAdmin from "../gcp/cloudsql/cloudsqladmin";
import { FirebaseError } from "../error";
import { grantRolesToCloudSqlServiceAccount } from "./checkIam";

const expect = chai.expect;

describe("grantRolesToCloudSqlServiceAccount", () => {
  let getInstanceStub: sinon.SinonStub;
  let getIamPolicyStub: sinon.SinonStub;
  let setIamPolicyStub: sinon.SinonStub;
  let mergeBindingsStub: sinon.SinonStub;
  let printManualIamConfigStub: sinon.SinonStub;

  beforeEach(() => {
    getInstanceStub = sinon.stub(cloudSqlAdmin, "getInstance");
    getIamPolicyStub = sinon.stub(resourceManager, "getIamPolicy");
    setIamPolicyStub = sinon.stub(resourceManager, "setIamPolicy");
    mergeBindingsStub = sinon.stub(iam, "mergeBindings");
    printManualIamConfigStub = sinon.stub(iam, "printManualIamConfig");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should grant roles to the Cloud SQL service account", async () => {
    const instance = { serviceAccountEmailAddress: "sa@example.com" };
    const policy = { bindings: [] };
    getInstanceStub.resolves(instance as any);
    getIamPolicyStub.resolves(policy);
    mergeBindingsStub.returns(true);
    setIamPolicyStub.resolves();

    await grantRolesToCloudSqlServiceAccount("project", "instance", ["role1", "role2"]);

    expect(getInstanceStub).to.be.calledWith("project", "instance");
    expect(getIamPolicyStub).to.be.calledWith("project");
    expect(mergeBindingsStub).to.be.calledWith(policy, [
      { role: "role1", members: ["serviceAccount:sa@example.com"] },
      { role: "role2", members: ["serviceAccount:sa@example.com"] },
    ]);
    expect(setIamPolicyStub).to.be.calledWith("project", policy, "bindings");
  });

  it("should throw an error if setting the IAM policy fails", async () => {
    const instance = { serviceAccountEmailAddress: "sa@example.com" };
    const policy = { bindings: [] };
    getInstanceStub.resolves(instance as any);
    getIamPolicyStub.resolves(policy);
    mergeBindingsStub.returns(true);
    setIamPolicyStub.rejects(new Error("IAM policy update failed"));

    await expect(
      grantRolesToCloudSqlServiceAccount("project", "instance", ["role1", "role2"]),
    ).to.be.rejectedWith(FirebaseError, "Unable to make required IAM policy changes.");

    expect(printManualIamConfigStub).to.be.calledWith(
      [
        { role: "role1", members: ["serviceAccount:sa@example.com"] },
        { role: "role2", members: ["serviceAccount:sa@example.com"] },
      ],
      "project",
      "dataconnect",
    );
  });

  it("should do nothing if bindings are not updated", async () => {
    const instance = { serviceAccountEmailAddress: "sa@example.com" };
    const policy = { bindings: [] };
    getInstanceStub.resolves(instance as any);
    getIamPolicyStub.resolves(policy);
    mergeBindingsStub.returns(false);

    await grantRolesToCloudSqlServiceAccount("project", "instance", ["role1", "role2"]);

    expect(setIamPolicyStub).to.not.be.called;
  });
});
