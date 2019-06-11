import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { doSetup, getProjectInfo, ProjectInfo } from "../../../init/features/project";
import * as firebaseApi from "../../../firebaseApi";
import * as prompt from "../../../prompt";

const TEST_FIREBASE_PROJECT: firebaseApi.FirebaseProject = {
  projectId: "my-project-123",
  projectNumber: 123456789,
  displayName: "my-project",
  name: "projects/my-project",
  resources: {
    hostingSite: "my-project",
    realtimeDatabaseInstance: "my-project",
    storageBucket: "my-project.appspot.com",
    locationId: "us-central",
  },
};

const ANOTHER_FIREBASE_PROJECT: firebaseApi.FirebaseProject = {
  projectId: "another-project",
  projectNumber: 987654321,
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

describe.only("project", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let listProjectsStub: sinon.SinonStub;
  let getProjectStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    listProjectsStub = sandbox.stub(firebaseApi, "listProjects");
    getProjectStub = sandbox.stub(firebaseApi, "getProject");
    promptStub = sandbox.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getProjectInfo", () => {
    it("should get correct project info when no project supplied", async () => {
      const options = {};
      listProjectsStub.returns([TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("my-project-123");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
    });

    it("should set instance and location to undefined when resources not provided", async () => {
      const options = {};
      listProjectsStub.returns([ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("another-project");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal({
        id: "another-project",
        label: "another-project (another-project)",
        instance: undefined,
        location: undefined,
      });
    });

    it("should get the correct project info when --project is supplied", async () => {
      const options = { project: "my-project" };
      getProjectStub.returns(TEST_FIREBASE_PROJECT);

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal(TEST_PROJECT_INFO);
    });

    it("should return correct project info when choosing new project", async () => {
      const options = {};
      listProjectsStub.returns([TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("[create a new project]");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal({ id: "[create a new project]" });
    });

    it("should return correct project info when choosing not to set up project", async () => {
      const options = {};
      listProjectsStub.returns([TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("[don't setup a default project]");

      const project = await getProjectInfo(options);

      expect(project).to.deep.equal({ id: "[don't setup a default project]" });
    });
  });

  describe("doSetup", () => {
    it("should set up the correct properties in the project", async () => {
      const options = { project: "my-project" };
      const setup = { config: {}, rcfile: {} };
      getProjectStub.returns(TEST_FIREBASE_PROJECT);

      await doSetup(setup, {}, options);

      expect(_.get(setup, "projectId")).to.deep.equal("my-project-123");
      expect(_.get(setup, "instance")).to.deep.equal("my-project");
      expect(_.get(setup, "projectLocation")).to.deep.equal("us-central");
      expect(_.get(setup.rcfile, "projects.default")).to.deep.equal("my-project-123");
    });

    it("should set up the correct properties when choosing new project", async () => {
      const options = {};
      const setup = { config: {}, rcfile: {} };
      listProjectsStub.returns([TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("[create a new project]");

      await doSetup(setup, {}, options);

      expect(_.get(setup, "createProject")).to.deep.equal(true);
    });

    it("should set up the correct properties when not choosing a project", async () => {
      const options = {};
      const setup = { config: {}, rcfile: {} };
      listProjectsStub.returns([TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT]);
      promptStub.returns("[don't setup a default project]");

      await doSetup(setup, {}, options);

      expect(setup).to.deep.equal({ config: {}, rcfile: {}, project: {} });
    });
  });
});
