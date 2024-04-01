import { expect } from "chai";
import * as sinon from "sinon";
import * as resourceManager from "../../../gcp/resourceManager";
import * as pn from "../../../getProjectNumber";
import * as v2FunctionHelper from "../../../deploy/extensions/v2FunctionHelper";
import * as ensureApiEnabled from "../../../ensureApiEnabled";
import * as projectUtils from "../../../projectUtils";

const GOOD_BINDING = {
  role: "roles/eventarc.eventReceiver",
  members: ["serviceAccount:123456-compute@developer.gserviceaccount.com"],
};

describe("ensureNecessaryV2ApisAndRoles", () => {
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;
  let needProjectIdStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let ensureApiEnabledStub: sinon.SinonStub;

  beforeEach(() => {
    getIamStub = sinon
      .stub(resourceManager, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(resourceManager, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
    needProjectIdStub = sinon
      .stub(projectUtils, "needProjectId")
      .throws("unexpected call to pn.getProjectNumber");
    getProjectNumberStub = sinon
      .stub(pn, "getProjectNumber")
      .throws("unexpected call to pn.getProjectNumber");
    ensureApiEnabledStub = sinon
      .stub(ensureApiEnabled, "ensure")
      .throws("unexpected call to ensureApiEnabled.ensure");

    getProjectNumberStub.resolves(123456);
    needProjectIdStub.returns("project_id");
    ensureApiEnabledStub.resolves(undefined);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should succeed when IAM policy is correct", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [GOOD_BINDING],
    });

    expect(await v2FunctionHelper.ensureNecessaryV2ApisAndRoles({ projectId: "project_id" })).to.not
      .throw;

    expect(getIamStub).to.have.been.calledWith("project_id");
    expect(setIamStub).to.not.have.been.called;
  });

  it("should fix the IAM policy by adding missing bindings", async () => {
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [],
    });
    setIamStub.resolves();

    expect(await v2FunctionHelper.ensureNecessaryV2ApisAndRoles({ projectId: "project_id" })).to.not
      .throw;

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
