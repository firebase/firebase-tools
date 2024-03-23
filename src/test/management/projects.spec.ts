import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";

import * as api from "../../api";
import * as projectManager from "../../management/projects";
import * as pollUtils from "../../operation-poller";
import * as prompt from "../../prompt";
import { FirebaseError } from "../../error";
import { CloudProjectInfo, FirebaseProjectMetadata } from "../../types/project";

const PROJECT_ID = "the-best-firebase-project";
const PROJECT_NUMBER = "1234567890";
const PROJECT_NAME = "The Best Project";
const PARENT_RESOURCE: projectManager.ProjectParentResource = {
  id: "1111111111111",
  type: projectManager.ProjectParentResourceType.FOLDER,
};
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const OPERATION_RESOURCE_NAME_2 = "operations/cp.22222222222222222";
const HOSTING_SITE = "fake.google.com";
const DATABASE_INSTANCE = "instance-database";
const STORAGE_BUCKET = "bucket-1";
const LOCATION_ID = "location-id";
const PAGE_TOKEN = "page-token";
const NEXT_PAGE_TOKEN = "next-page-token";

const TEST_FIREBASE_PROJECT: FirebaseProjectMetadata = {
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

const ANOTHER_FIREBASE_PROJECT: FirebaseProjectMetadata = {
  projectId: "another-project",
  projectNumber: "987654321",
  displayName: "another-project",
  name: "projects/another-project",
  resources: {},
};

const TEST_CLOUD_PROJECT: CloudProjectInfo = {
  project: "projects/my-project-123",
  displayName: "my-project",
  locationId: "us-central",
};

const ANOTHER_CLOUD_PROJECT: CloudProjectInfo = {
  project: "projects/another-project",
  displayName: "another-project",
  locationId: "us-central",
};

function generateFirebaseProjectList(counts: number): FirebaseProjectMetadata[] {
  return Array.from(Array(counts), (_, i: number) => ({
    name: `projects/project-id-${i}`,
    projectId: `project-id-${i}`,
    displayName: `Project ${i}`,
    projectNumber: `${i}`,
    resources: {
      hostingSite: `site-${i}`,
      realtimeDatabaseInstance: `instance-${i}`,
      storageBucket: `bucket-${i}`,
      locationId: `location-${i}`,
    },
  }));
}

function generateCloudProjectList(counts: number): CloudProjectInfo[] {
  return Array.from(Array(counts), (_, i: number) => ({
    project: `projects/project-id-${i}`,
    displayName: `Project ${i}`,
    locationId: `location-${i}`,
  }));
}

describe("Project management", () => {
  let sandbox: sinon.SinonSandbox;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation").throws("Unexpected poll call");
    nock.disableNetConnect();
  });

  afterEach(() => {
    sandbox.restore();
    nock.enableNetConnect();
  });

  describe("Interactive flows", () => {
    let promptOnceStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    });

    describe("getOrPromptProject", () => {
      it("should get project from list if it is able to list all projects", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 100 })
          .reply(200, {
            results: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
          });
        promptOnceStub.resolves("my-project-123");

        const project = await projectManager.getOrPromptProject({});

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
        expect(nock.isDone()).to.be.true;
      });

      it("should prompt project id if it is not able to list all projects", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 100 })
          .reply(200, {
            results: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
            nextPageToken: "token",
          });
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects/my-project-123")
          .reply(200, TEST_FIREBASE_PROJECT);
        promptOnceStub.resolves("my-project-123");

        const project = await projectManager.getOrPromptProject({});

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("input");
        expect(nock.isDone()).to.be.true;
      });

      it("should throw if there's no project", async () => {
        nock(api.firebaseApiOrigin).get("/v1beta1/projects").query({ pageSize: 100 }).reply(200, {
          results: [],
        });

        let err;
        try {
          await projectManager.getOrPromptProject({});
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "There are no Firebase projects associated with this account.",
        );
        expect(promptOnceStub).to.be.not.called;
        expect(nock.isDone()).to.be.true;
      });

      it("should get the correct project info when --project is supplied", async () => {
        const options = { project: "my-project-123" };
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects/my-project-123")
          .reply(200, TEST_FIREBASE_PROJECT);

        const project = await projectManager.getOrPromptProject(options);

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.not.called;
        expect(nock.isDone()).to.be.true;
      });

      it("should throw error when getFirebaseProject throw an error", async () => {
        const options = { project: "my-project-123" };
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects/my-project-123")
          .reply(500, { error: "Failed to get project" });

        let err;
        try {
          await projectManager.getOrPromptProject(options);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to get Firebase project my-project-123" +
            ". Please make sure the project exists and your account has permission to access it.",
        );
        expect(err.original.toString()).to.contain("Failed to get project");
        expect(promptOnceStub).to.be.not.called;
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("promptAvailableProjectId", () => {
      it("should select project from list if it is able to list all projects", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize: 100 })
          .reply(200, {
            projectInfo: [TEST_CLOUD_PROJECT, ANOTHER_CLOUD_PROJECT],
          });
        promptOnceStub.resolves("my-project-123");

        const projectId = await projectManager.promptAvailableProjectId();

        expect(projectId).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
        expect(nock.isDone()).to.be.true;
      });

      it("should prompt project id if it is not able to list all projects", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize: 100 })
          .reply(200, {
            projectInfo: [TEST_CLOUD_PROJECT, ANOTHER_CLOUD_PROJECT],
            nextPageToken: "token",
          });
        promptOnceStub.resolves("my-project-123");

        const projectId = await projectManager.promptAvailableProjectId();

        expect(projectId).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("input");
        expect(nock.isDone()).to.be.true;
      });

      it("should throw if there's no project", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize: 100 })
          .reply(200, {
            projectInfo: [],
          });

        let err;
        try {
          await projectManager.promptAvailableProjectId();
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "There are no available Google Cloud projects to add Firebase services.",
        );
        expect(promptOnceStub).to.be.not.called;
        expect(nock.isDone()).to.be.true;
      });
    });
  });

  describe("API methods", () => {
    describe("createCloudProject", () => {
      it("should resolve with cloud project data if it succeeds", async () => {
        const expectedProjectInfo = {
          projectNumber: PROJECT_NUMBER,
          projectId: PROJECT_ID,
          name: PROJECT_NAME,
        };
        nock(api.resourceManagerOrigin)
          .post("/v1/projects")
          .reply(200, { name: OPERATION_RESOURCE_NAME_1 });
        pollOperationStub.onFirstCall().resolves(expectedProjectInfo);

        const resultProjectInfo = await projectManager.createCloudProject(PROJECT_ID, {
          displayName: PROJECT_NAME,
          parentResource: PARENT_RESOURCE,
        });

        expect(resultProjectInfo).to.equal(expectedProjectInfo);
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: OPERATION_RESOURCE_NAME_1,
        });
      });

      it("should reject if Cloud project creation fails", async () => {
        nock(api.resourceManagerOrigin).post("/v1/projects").reply(404);

        let err;
        try {
          await projectManager.createCloudProject(PROJECT_ID, {
            displayName: PROJECT_NAME,
            parentResource: PARENT_RESOURCE,
          });
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to create project. See firebase-debug.log for more info.",
        );
        expect(err.original).to.be.an.instanceOf(FirebaseError, "Not Found");
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.not.called;
      });

      it("should reject if Cloud project creation polling throws error", async () => {
        const expectedError = new Error("Entity already exists");
        nock(api.resourceManagerOrigin)
          .post("/v1/projects")
          .reply(200, { name: OPERATION_RESOURCE_NAME_1 });
        pollOperationStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.createCloudProject(PROJECT_ID, {
            displayName: PROJECT_NAME,
            parentResource: PARENT_RESOURCE,
          });
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to create project. See firebase-debug.log for more info.",
        );
        expect(err.original).to.equal(expectedError);
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: OPERATION_RESOURCE_NAME_1,
        });
      });
    });

    describe("addFirebaseToCloudProject", () => {
      it("should resolve with Firebase project data if it succeeds", async () => {
        const expectFirebaseProjectInfo = { projectId: PROJECT_ID, displayName: PROJECT_NAME };
        nock(api.firebaseApiOrigin)
          .post(`/v1beta1/projects/${PROJECT_ID}:addFirebase`)
          .reply(200, { name: OPERATION_RESOURCE_NAME_2 });
        pollOperationStub
          .onFirstCall()
          .resolves({ projectId: PROJECT_ID, displayName: PROJECT_NAME });

        const resultProjectInfo = await projectManager.addFirebaseToCloudProject(PROJECT_ID);

        expect(resultProjectInfo).to.deep.equal(expectFirebaseProjectInfo);
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: OPERATION_RESOURCE_NAME_2,
        });
      });

      it("should reject if add Firebase api call fails", async () => {
        nock(api.firebaseApiOrigin).post(`/v1beta1/projects/${PROJECT_ID}:addFirebase`).reply(404);

        let err;
        try {
          await projectManager.addFirebaseToCloudProject(PROJECT_ID);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
        );
        expect(err.original).to.be.an.instanceOf(FirebaseError, "Not Found");
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.not.called;
      });

      it("should reject if polling add Firebase operation throws error", async () => {
        const expectedError = new Error("Permission denied");
        nock(api.firebaseApiOrigin)
          .post(`/v1beta1/projects/${PROJECT_ID}:addFirebase`)
          .reply(200, { name: OPERATION_RESOURCE_NAME_2 });
        pollOperationStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.addFirebaseToCloudProject(PROJECT_ID);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
        );
        expect(err.original).to.equal(expectedError);
        expect(nock.isDone()).to.be.true;
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: OPERATION_RESOURCE_NAME_2,
        });
      });
    });

    describe("getAvailableCloudProjectPage", () => {
      it("should resolve with a project page if it succeeds (no input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateCloudProjectList(pageSize);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize })
          .reply(200, { projectInfo: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(nock.isDone()).to.be.true;
      });

      it("should resolve with a project page if it succeeds (with input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateCloudProjectList(pageSize);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize, pageToken: PAGE_TOKEN })
          .reply(200, { projectInfo: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize, PAGE_TOKEN);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(nock.isDone()).to.be.true;
      });

      it("should resolve with a project page if it succeeds with no next page token", async () => {
        const pageSize = 10;
        const projectCounts = 5;
        const expectedProjectList = generateCloudProjectList(projectCounts);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize })
          .reply(200, { projectInfo: expectedProjectList });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.be.undefined;
        expect(nock.isDone()).to.be.true;
      });

      it("should reject if the api call fails", async () => {
        const pageSize = 100;
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/availableProjects")
          .query({ pageSize, pageToken: PAGE_TOKEN })
          .reply(404, { error: "Not Found" });

        let err;
        try {
          await projectManager.getAvailableCloudProjectPage(pageSize, PAGE_TOKEN);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list available Google Cloud Platform projects. See firebase-debug.log for more info.",
        );
        expect(err.original.toString()).to.contain("Not Found");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("getFirebaseProjectPage", () => {
      it("should resolve with a project page if it succeeds (no input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateFirebaseProjectList(pageSize);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize })
          .reply(200, { results: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(nock.isDone()).to.be.true;
      });

      it("should resolve with a project page if it succeeds (with input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateFirebaseProjectList(pageSize);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize, pageToken: PAGE_TOKEN })
          .reply(200, { results: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize, PAGE_TOKEN);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(nock.isDone()).to.be.true;
      });

      it("should resolve with a project page if it succeeds with no next page token", async () => {
        const pageSize = 10;
        const projectCounts = 5;
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize })
          .reply(200, { results: expectedProjectList });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.be.undefined;
        expect(nock.isDone()).to.be.true;
      });

      it("should reject if the api call fails", async () => {
        const pageSize = 100;
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize, pageToken: PAGE_TOKEN })
          .reply(404, { error: "Not Found" });

        let err;
        try {
          await projectManager.getFirebaseProjectPage(pageSize, PAGE_TOKEN);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info.",
        );
        expect(err.original.toString()).to.contain("Not Found");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("listFirebaseProjects", () => {
      it("should resolve with project list if it succeeds with only 1 api call", async () => {
        const projectCounts = 10;
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 1000 })
          .reply(200, { results: expectedProjectList });

        const projects = await projectManager.listFirebaseProjects();

        expect(projects).to.deep.equal(expectedProjectList);
        expect(nock.isDone()).to.be.true;
      });

      it("should concatenate pages to get project list if it succeeds with multiple api calls", async () => {
        const projectCounts = 10;
        const pageSize = 5;
        const nextPageToken = "next-page-token";
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 5 })
          .reply(200, { results: expectedProjectList.slice(0, pageSize), nextPageToken });
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 5, pageToken: nextPageToken })
          .reply(200, {
            results: expectedProjectList.slice(pageSize, projectCounts),
          });

        const projects = await projectManager.listFirebaseProjects(pageSize);

        expect(projects).to.deep.equal(expectedProjectList);
        expect(nock.isDone()).to.be.true;
      });

      it("should reject if the first api call fails", async () => {
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 1000 })
          .reply(404, { error: "Not Found" });

        let err;
        try {
          await projectManager.listFirebaseProjects();
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info.",
        );
        expect(err.original.toString()).to.contain("Not Found");
        expect(nock.isDone()).to.be.true;
      });

      it("should reject if error is thrown in subsequent api call", async () => {
        const projectCounts = 10;
        const pageSize = 5;
        const nextPageToken = "next-page-token";
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 5 })
          .reply(200, { results: expectedProjectList.slice(0, pageSize), nextPageToken });
        nock(api.firebaseApiOrigin)
          .get("/v1beta1/projects")
          .query({ pageSize: 5, pageToken: nextPageToken })
          .reply(404, { error: "Not Found" });

        let err;
        try {
          await projectManager.listFirebaseProjects(pageSize);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info.",
        );
        expect(err.original.toString()).to.contain("Not Found");
        expect(nock.isDone()).to.be.true;
      });
    });

    describe("getFirebaseProject", () => {
      it("should resolve with project information if it succeeds", async () => {
        const expectedProjectInfo: FirebaseProjectMetadata = {
          name: `projects/${PROJECT_ID}`,
          projectId: PROJECT_ID,
          displayName: PROJECT_NAME,
          projectNumber: PROJECT_NUMBER,
          resources: {
            hostingSite: HOSTING_SITE,
            realtimeDatabaseInstance: DATABASE_INSTANCE,
            storageBucket: STORAGE_BUCKET,
            locationId: LOCATION_ID,
          },
        };
        nock(api.firebaseApiOrigin)
          .get(`/v1beta1/projects/${PROJECT_ID}`)
          .reply(200, expectedProjectInfo);

        const projects = await projectManager.getFirebaseProject(PROJECT_ID);

        expect(projects).to.deep.equal(expectedProjectInfo);
        expect(nock.isDone()).to.be.true;
      });

      it("should reject if the api call fails", async () => {
        nock(api.firebaseApiOrigin)
          .get(`/v1beta1/projects/${PROJECT_ID}`)
          .reply(404, { error: "Not Found" });

        let err;
        try {
          await projectManager.getFirebaseProject(PROJECT_ID);
        } catch (e: any) {
          err = e;
        }

        expect(err.message).to.equal(
          `Failed to get Firebase project ${PROJECT_ID}. ` +
            "Please make sure the project exists and your account has permission to access it.",
        );
        expect(err.original.toString()).to.contain("Not Found");
        expect(nock.isDone()).to.be.true;
      });
    });
  });
});
