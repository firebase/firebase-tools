import { expect } from "chai";
import * as sinon from "sinon";

import { getProjectNumber } from "./getProjectNumber";
import * as projectUtils from "./projectUtils";
import * as projects from "./management/projects";

const PROJECT_ID = "test-project-id";
const PROJECT_NUMBER = "123456789";

describe("getProjectNumber", () => {
  let sandbox: sinon.SinonSandbox;
  let needProjectIdStub: sinon.SinonStub;
  let getProjectStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    getProjectStub = sandbox.stub(projects, "getProject");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return project number from options if it exists", async () => {
    const options = { projectNumber: PROJECT_NUMBER };
    const projectNumber = await getProjectNumber(options);

    expect(projectNumber).to.equal(PROJECT_NUMBER);
    expect(needProjectIdStub).to.not.have.been.called;
    expect(getProjectStub).to.not.have.been.called;
  });

  it("should fetch project number if not in options", async () => {
    const options: any = { projectId: PROJECT_ID };
    getProjectStub.resolves({ projectNumber: PROJECT_NUMBER });

    const projectNumber = await getProjectNumber(options);

    expect(projectNumber).to.equal(PROJECT_NUMBER);
    expect(needProjectIdStub).to.have.been.calledWith(options);
    expect(getProjectStub).to.have.been.calledWith(PROJECT_ID);
    expect(options.projectNumber).to.equal(PROJECT_NUMBER);
  });
});
