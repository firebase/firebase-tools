import { expect } from "chai";
import * as sinon from "sinon";
import { create_project } from "./create_project";
import * as projects from "../../../management/projects";
import * as error from "../../../error";
import { toContent } from "../../util";

describe("create_project tool", () => {
  const projectId = "test-project";
  const displayName = "My Project";

  let getProjectStub: sinon.SinonStub;
  let checkFirebaseEnabledStub: sinon.SinonStub;
  let createFirebaseProjectStub: sinon.SinonStub;
  let addFirebaseToCloudProjectStub: sinon.SinonStub;
  let getErrStatusStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectStub = sinon.stub(projects, "getProject");
    checkFirebaseEnabledStub = sinon.stub(projects, "checkFirebaseEnabledForCloudProject");
    createFirebaseProjectStub = sinon.stub(projects, "createFirebaseProjectAndLog");
    addFirebaseToCloudProjectStub = sinon.stub(projects, "addFirebaseToCloudProject");
    getErrStatusStub = sinon.stub(error, "getErrStatus");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should create a new project if it seems inaccessible (403)", async () => {
    const newProject = { projectId, displayName };
    getProjectStub.rejects(new Error("Permission denied"));
    getErrStatusStub.returns(403);
    createFirebaseProjectStub.resolves(newProject);

    const result = await (create_project as any)._fn({
      project_id: projectId,
      display_name: displayName,
    });

    expect(getProjectStub).to.be.calledWith(projectId);
    expect(createFirebaseProjectStub).to.be.calledWith(projectId, { displayName });
    expect(result).to.deep.equal(
      toContent({
        message: `Successfully created new Firebase project: ${projectId}`,
        project: newProject,
      }),
    );
  });

  it("should re-throw non-403 errors from getProject", async () => {
    const thrownError = new Error("Something went wrong");
    getProjectStub.rejects(thrownError);
    getErrStatusStub.returns(500);

    await expect((create_project as any)._fn({ project_id: projectId })).to.be.rejected;
  });

  it("should add Firebase to an existing Cloud project", async () => {
    const cloudProject = { projectId, displayName };
    const firebaseProject = { projectId, displayName, projectNumber: "123" };
    getProjectStub.resolves(cloudProject);
    checkFirebaseEnabledStub.resolves(undefined); // Firebase not enabled
    addFirebaseToCloudProjectStub.resolves(firebaseProject);

    const result = await (create_project as any)._fn({ project_id: projectId });

    expect(getProjectStub).to.be.calledWith(projectId);
    expect(checkFirebaseEnabledStub).to.be.calledWith(projectId);
    expect(addFirebaseToCloudProjectStub).to.be.calledWith(projectId);
    expect(result).to.deep.equal(
      toContent({
        message: `Successfully added Firebase to existing project: ${projectId}`,
        project: firebaseProject,
      }),
    );
  });

  it("should do nothing if Firebase is already enabled", async () => {
    const cloudProject = { projectId, displayName };
    const firebaseProject = { projectId, displayName, projectNumber: "123" };
    getProjectStub.resolves(cloudProject);
    checkFirebaseEnabledStub.resolves(firebaseProject);

    const result = await (create_project as any)._fn({ project_id: projectId });

    expect(getProjectStub).to.be.calledWith(projectId);
    expect(checkFirebaseEnabledStub).to.be.calledWith(projectId);
    expect(addFirebaseToCloudProjectStub).to.not.be.called;
    expect(result).to.deep.equal(
      toContent({
        message: `Project ${projectId} already exists and has Firebase enabled.`,
        project: firebaseProject,
      }),
    );
  });
});
