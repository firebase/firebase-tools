import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { doSetup, getProjectInfo, ProjectInfo } from "../../../init/features/project";
import * as projectManager from "../../../management/projects";
import * as prompt from "../../../prompt";

const TEST_FIREBASE_PROJECT: projectManager.FirebaseProjectMetadata = {
  projectId: "my-project-123",
  projectNumber: "123456789",
  displayName: "my-project",
  name: "projects/my-project",
  resources: {
    hostingSite: "my-project",
    realtimeDatabaseInstance: "my-project",
    storageBucket: "my-project.appspot.com",
    locationId: "us-central",
  },
};

const ANOTHER_FIREBASE_PROJECT: projectManager.FirebaseProjectMetadata = {
  projectId: "another-project",
  projectNumber: "987654321",
  displayName: "another-project",
  name: "projects/another-project",
  resources: {},
};

const TEST_PROJECT_INFO: ProjectInfo = {
  id: "my-project-123",
  label: "my-project-123 (my-project)",
  instance: "my-project",
  location: "us-central",
};

describe("project", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let getProjectPageStub: sinon.SinonStub;
  let getProjectStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectPageStub = sandbox.stub(projectManager, "getProjectPage");
    getProjectStub = sandbox.stub(projectManager, "getFirebaseProject");
    promptStub = sandbox.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getProjectInfo", () => {
    it("should get project from list if it is able to list all projects", async () => {
      const options = {};
      getProjectPageStub.resolves({
        projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
      });
      promptStub.returns("my-project-123");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.not.called;
      expect(promptStub).to.be.calledOnce;
      expect(promptStub.firstCall.args[0].type).to.equal("list");
    });

    it("should prompt project id if it is not able to list all projects", async () => {
      const options = {};
      getProjectPageStub.resolves({
        projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
        nextPageToken: "token",
      });
      getProjectStub.resolves(TEST_FIREBASE_PROJECT);
      promptStub.returns("my-project-123");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.calledWith("my-project-123");
      expect(promptStub).to.be.calledOnce;
      expect(promptStub.firstCall.args[0].type).to.equal("input");
    });

    it("should throw if there's no project", async () => {
      const options = {};
      getProjectPageStub.resolves({
        projects: [],
      });

      let err;
      try {
        const project = await getProjectInfo(options);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal("There is no Firebase project associated with this account.");
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.not.called;
      expect(promptStub).to.be.not.called;
    });

    it("should set instance and location to undefined when resources not provided", async () => {
      const options = {};
      getProjectPageStub.returns({ projects: [ANOTHER_FIREBASE_PROJECT] });
      promptStub.returns("another-project");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal({
        id: "another-project",
        label: "another-project (another-project)",
        instance: undefined,
        location: undefined,
      });
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.not.called;
      expect(promptStub).to.be.calledOnce;
      expect(promptStub.firstCall.args[0].type).to.equal("list");
    });

    it("should get the correct project info when --project is supplied", async () => {
      const options = { project: "my-project-123" };
      getProjectStub.returns(TEST_FIREBASE_PROJECT);

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectStub).to.be.calledWith("my-project-123");
      expect(promptStub).to.be.not.called;
    });

    it("should throw error when getFirebaseProject throw an error", async () => {
      const options = { project: "my-project-123" };
      const expectedError = new Error("Failed to get project");
      getProjectStub.rejects(expectedError);

      let err;
      try {
        await getProjectInfo(options);
      } catch (e) {
        err = e;
      }

      expect(err).to.equal(expectedError);
      expect(getProjectStub).to.be.calledWith("my-project-123");
    });
  });

  describe("doSetup", () => {
    it("should set up the correct properties in the project", async () => {
      const options = { project: "my-project" };
      const setup = { config: {}, rcfile: {} };
      promptStub.onFirstCall().returns("Use an existing project");
      getProjectStub.returns(TEST_FIREBASE_PROJECT);

      await doSetup(setup, {}, options);

      expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
      expect(_.get(setup, "instance")).to.deep.equal("my-project");
      expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
      expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
      expect(promptStub).to.be.calledOnce;
    });

    it("should set up the correct properties when choosing new project", async () => {
      const options = {};
      const setup = { config: {}, rcfile: {} };
      getProjectPageStub.returns({ projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT] });
      promptStub.onFirstCall().returns("Create a new project");

      await doSetup(setup, {}, options);

      expect(_.get(setup, "createProject")).to.deep.equal(true);
      expect(promptStub).to.be.calledOnce;
    });

    it("should set up the correct properties when not choosing a project", async () => {
      const options = {};
      const setup = { config: {}, rcfile: {} };
      getProjectPageStub.returns({ projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT] });
      promptStub.returns("Don't set up a default project");

      await doSetup(setup, {}, options);

      expect(setup).to.deep.equal({ config: {}, rcfile: {}, project: {} });
    });

    it("should set project location even if .firebaserc is already set up", async () => {
      const options = {};
      const setup = { config: {}, rcfile: { projects: { default: "my-project" } } };
      getProjectStub.returns(TEST_FIREBASE_PROJECT);

      await doSetup(setup, {}, options);

      expect(_.get(setup, "projectId")).to.equal("my-project");
      expect(_.get(setup, "projectLocation")).to.equal("us-central");
      expect(promptStub).to.be.not.called;
    });
  });
});
