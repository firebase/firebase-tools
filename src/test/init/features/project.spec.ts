import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";
import { configstore } from "../../../configstore";

import { doSetup } from "../../../init/features/project";
import * as projectManager from "../../../management/projects";
import * as prompt from "../../../prompt";
import { Config } from "../../../config";

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

describe("project", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let getProjectStub: sinon.SinonStub;
  let createFirebaseProjectStub: sinon.SinonStub;
  let getOrPromptProjectStub: sinon.SinonStub;
  let addFirebaseProjectStub: sinon.SinonStub;
  let promptAvailableProjectIdStub: sinon.SinonStub;
  let promptOnceStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  let configstoreSetStub: sinon.SinonStub;
  let emptyConfig: Config;

  beforeEach(() => {
    getProjectStub = sandbox.stub(projectManager, "getFirebaseProject");
    createFirebaseProjectStub = sandbox.stub(projectManager, "createFirebaseProjectAndLog");
    getOrPromptProjectStub = sandbox.stub(projectManager, "getOrPromptProject");
    addFirebaseProjectStub = sandbox.stub(projectManager, "addFirebaseToCloudProjectAndLog");
    promptAvailableProjectIdStub = sandbox.stub(projectManager, "promptAvailableProjectId");
    promptStub = sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");
    promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    configstoreSetStub = sandbox.stub(configstore, "set").throws("Unexpected configstore set");
    emptyConfig = new Config("{}", {});
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    describe('with "Use an existing project" option', () => {
      it("should set up the correct properties in the project", async () => {
        const options = { project: "my-project" };
        const setup = { config: {}, rcfile: {} };
        getProjectStub.onFirstCall().resolves(TEST_FIREBASE_PROJECT);
        promptOnceStub.onFirstCall().resolves("Use an existing project");
        getOrPromptProjectStub.onFirstCall().resolves(TEST_FIREBASE_PROJECT);
        configstoreSetStub.onFirstCall().resolves();

        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
        expect(_.get(setup, "instance")).to.deep.equal("my-project");
        expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
        expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.not.be.called;
        expect(getOrPromptProjectStub).to.not.be.called;
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
        configstoreSetStub.onFirstCall().resolves();

        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
        expect(_.get(setup, "instance")).to.deep.equal("my-project");
        expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
        expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptStub).to.be.calledOnce;
        expect(createFirebaseProjectStub).to.be.calledOnceWith("my-project-123", {
          displayName: "my-project",
        });
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
        configstoreSetStub.onFirstCall().resolves();

        let err;
        try {
          await doSetup(setup, emptyConfig, options);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal("Project ID cannot be empty");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptStub).to.be.calledOnce;
        expect(createFirebaseProjectStub).to.be.not.called;
      });
    });

    describe('with "Add Firebase resources to GCP project" option', () => {
      it("should add firebase resources and set up the correct properties", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        promptOnceStub
          .onFirstCall()
          .resolves("Add Firebase to an existing Google Cloud Platform project");
        promptAvailableProjectIdStub.onFirstCall().resolves("my-project-123");
        addFirebaseProjectStub.onFirstCall().resolves(TEST_FIREBASE_PROJECT);
        configstoreSetStub.onFirstCall().resolves();

        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
        expect(_.get(setup, "instance")).to.deep.equal("my-project");
        expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
        expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptAvailableProjectIdStub).to.be.calledOnce;
        expect(addFirebaseProjectStub).to.be.calledOnceWith("my-project-123");
      });

      it("should throw if project ID is empty after prompt", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        promptOnceStub
          .onFirstCall()
          .resolves("Add Firebase to an existing Google Cloud Platform project");
        promptAvailableProjectIdStub.onFirstCall().resolves("");

        let err;
        try {
          await doSetup(setup, emptyConfig, options);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal("Project ID cannot be empty");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptAvailableProjectIdStub).to.be.calledOnce;
        expect(addFirebaseProjectStub).to.be.not.called;
      });
    });

    describe(`with "Don't set up a default project" option`, () => {
      it("should set up the correct properties when not choosing a project", async () => {
        const options = {};
        const setup = { config: {}, rcfile: {} };
        promptOnceStub.resolves("Don't set up a default project");

        await doSetup(setup, emptyConfig, options);

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
        await doSetup(setup, emptyConfig, options);

        expect(promptOnceStub).to.be.not.called;
        expect(promptStub).to.be.not.called;
      });

      it("should set project location even if .firebaserc is already set up", async () => {
        await doSetup(setup, emptyConfig, options);

        expect(_.get(setup, "projectId")).to.equal("my-project-123");
        expect(_.get(setup, "projectLocation")).to.equal("us-central");
        expect(getProjectStub).to.be.calledOnceWith("my-project-123");
      });
    });
  });
});
