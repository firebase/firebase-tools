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
  let createFirebaseProjectStub: sinon.SinonStub;
  let promptOnceStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    getProjectPageStub = sandbox.stub(projectManager, "getProjectPage");
    getProjectStub = sandbox.stub(projectManager, "getFirebaseProject");
    createFirebaseProjectStub = sandbox.stub(projectManager, "createFirebaseProject");
    promptStub = sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
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
      promptOnceStub.returns("my-project-123");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.not.called;
      expect(promptOnceStub).to.be.calledOnce;
      expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
    });

    it("should prompt project id if it is not able to list all projects", async () => {
      const options = {};
      getProjectPageStub.resolves({
        projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
        nextPageToken: "token",
      });
      getProjectStub.resolves(TEST_FIREBASE_PROJECT);
      promptOnceStub.resolves("my-project-123");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.calledWith("my-project-123");
      expect(promptOnceStub).to.be.calledOnce;
      expect(promptOnceStub.firstCall.args[0].type).to.equal("input");
    });

    it("should set instance and location to undefined when resources not provided", async () => {
      const options = {};
      getProjectPageStub.resolves({ projects: [ANOTHER_FIREBASE_PROJECT] });
      promptOnceStub.resolves("another-project");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal({
        id: "another-project",
        label: "another-project (another-project)",
        instance: undefined,
        location: undefined,
      });
      expect(getProjectPageStub).to.be.calledWith(100);
      expect(getProjectStub).to.be.not.called;
      expect(promptOnceStub).to.be.calledOnce;
      expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
    });

    it("should get the correct project info when --project is supplied", async () => {
      const options = { project: "my-project-123" };
      getProjectStub.resolves(TEST_FIREBASE_PROJECT);

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
      expect(getProjectStub).to.be.calledWith("my-project-123");
      expect(promptOnceStub).to.be.not.called;
    });

    it("should throw error when getFirebaseProject throw an error", async () => {
      const options = { project: "my-project-123" };
      getProjectStub.rejects("failed to get project");

      let err;
      try {
        await getProjectInfo(options);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Error getting project my-project-123. Please make sure the project exists and belongs to your account."
      );
      expect(getProjectStub).to.be.calledWith("my-project-123");
      expect(promptOnceStub).to.be.not.called;
    });
  });

  describe("doSetup", () => {
    describe('with "Use an existing project" option', () => {
      it("should set up the correct properties in the project", async () => {
        const options = { project: "my-project" };
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("Use an existing project");
        getProjectStub.resolves(TEST_FIREBASE_PROJECT);

        await doSetup(setup, {}, options);

        expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
        expect(_.get(setup, "instance")).to.deep.equal("my-project");
        expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
        expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
      });
    });

    describe('with "Create a new project" option', () => {
      it("should create a new project and set up the correct properties", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("Create a new project");
        const fakePromptFn = (promptAnswer: any) => {
          promptAnswer.projectId = "my-project-123";
          promptAnswer.displayName = "my-project";
        };
        promptStub
          .withArgs({}, projectManager.PROJECTS_CREATE_QUESTIONS)
          .onFirstCall()
          .callsFake(fakePromptFn);
        createFirebaseProjectStub.resolves(TEST_FIREBASE_PROJECT);

        await doSetup(setup, {}, options);

        expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
        expect(_.get(setup, "instance")).to.deep.equal("my-project");
        expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
        expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptStub).to.be.calledOnce;
      });

      it("should throw if project ID is empty after prompt", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.onFirstCall().resolves("Create a new project");
        const fakePromptFn = (promptAnswer: any) => {
          promptAnswer.projectId = "";
        };
        promptStub
          .withArgs({}, projectManager.PROJECTS_CREATE_QUESTIONS)
          .onFirstCall()
          .callsFake(fakePromptFn);

        let err;
        try {
          await doSetup(setup, {}, options);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal("Project ID cannot be empty");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptStub).to.be.calledOnce;
        expect(createFirebaseProjectStub).to.be.not.called;
      });
    });

    describe('with "Don\'t set up a default project" option', () => {
      it("should set up the correct properties when not choosing a project", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        getProjectPageStub.resolves({
          projects: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
        });
        promptOnceStub.resolves("Don't set up a default project");

        await doSetup(setup, {}, options);

        expect(setup).to.deep.equal({ config: {}, rcfile: {}, project: {} });
        expect(promptOnceStub).to.be.calledOnce;
      });
    });

    describe("with defined .firebaserc file", () => {
      let options: any;
      let setup: any;

      beforeEach(() => {
        options = {};
        setup = { config: {}, rcfile: { projects: { default: "my-project-123" } } };
        getProjectStub.onFirstCall().resolves(TEST_FIREBASE_PROJECT);
      });

      it("should not prompt", async () => {
        await doSetup(setup, {}, options);

        expect(promptOnceStub).to.be.not.called;
        expect(promptStub).to.be.not.called;
      });

      it("should set project location even if .firebaserc is already set up", async () => {
        await doSetup(setup, {}, options);

        expect(_.get(setup, "projectId")).to.equal("my-project-123");
        expect(_.get(setup, "projectLocation")).to.equal("us-central");
        expect(getProjectStub).to.be.calledOnceWith("my-project-123");
      });
    });
  });
});
