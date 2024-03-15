import { expect } from "chai";
import * as sinon from "sinon";
import * as resourceManager from "../../gcp/resourceManager";
import * as pn from "../../getProjectNumber";
import * as diagnose from "../../extensions/diagnose";
import * as extensionsApi from "../../extensions/extensionsApi";
import * as prompt from "../../prompt";

const GOOD_BINDING = {
  role: "roles/firebasemods.serviceAgent",
  members: ["serviceAccount:service-123456@gcp-sa-firebasemods.iam.gserviceaccount.com"],
};

describe("diagnose", () => {
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let promptOnceStub: sinon.SinonStub;
  let listInstancesStub: sinon.SinonStub;

  beforeEach(() => {
    getIamStub = sinon
      .stub(resourceManager, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(resourceManager, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
    getProjectNumberStub = sinon
      .stub(pn, "getProjectNumber")
      .throws("unexpected call to pn.getProjectNumber");
    promptOnceStub = sinon
      .stub(prompt, "promptOnce")
      .throws("unexpected call to prompt.promptOnce");
    listInstancesStub = sinon
      .stub(extensionsApi, "listInstances")
      .throws("unexpected call to extensionsApi.listInstances");

    getProjectNumberStub.resolves(123456);
    listInstancesStub.resolves([]);
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
    promptOnceStub.resolves(false);

    expect(await diagnose.diagnose("project_id")).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fail when project IAM policy missing extensions service agent (no fix)", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });
    promptOnceStub.resolves(false);

    expect(await diagnose.diagnose("project_id")).to.be.false;

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
    promptOnceStub.resolves(true);

    expect(await diagnose.diagnose("project_id")).to.be.true;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.have.been.calledWith(
      "project_id",
      {
        etag: "etag",
        version: 3,
        bindings: [GOOD_BINDING],
      },
      "bindings",
    );
  });
});
