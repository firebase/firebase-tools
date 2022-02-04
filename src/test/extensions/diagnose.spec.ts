import { expect } from "chai";
import * as sinon from "sinon";
import * as resourceManager from "../../gcp/resourceManager";
import * as pn from "../../getProjectNumber";
import * as diagnose from "../../extensions/diagnose";
import { setIamPolicy } from "../../gcp/cloudfunctions";

const GOOD_BINDING = {
  role: "roles/firebasemods.serviceAgent",
  members: ["serviceAccount:service-123456@gcp-sa-firebasemods.iam.gserviceaccount.com"],
};

describe.only("diagnose", () => {
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;
  let getProjectNumber: sinon.SinonStub;

  beforeEach(() => {
    getIamStub = sinon
      .stub(resourceManager, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(resourceManager, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
    getProjectNumber = sinon
      .stub(pn, "getProjectNumber")
      .throws("unexpected call to pn.getProjectNumber");

    getProjectNumber.resolves(123456);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should succeed when IAM policy is correct (no fix)", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [GOOD_BINDING],
    });

    expect(await diagnose.diagnose("project_id", false)).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fail when project IAM policy missing extensions service agent (no fix)", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });

    expect(await diagnose.diagnose("project_id", false)).to.be.false;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fix the project IAM policy by adding missing bindings", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });
    setIamStub.resolves();

    expect(await diagnose.diagnose("project_id", true)).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.have.been.calledWith(
      "project_id",
      {
        etag: "etag",
        version: 3,
        bindings: [GOOD_BINDING],
      },
      "bindings"
    );
  });
});
