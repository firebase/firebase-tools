import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import * as projectManager from "../../management/projects";
import * as pollUtils from "../../operation-poller";
import * as prompt from "../../prompt";

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

const TEST_CLOUD_PROJECT: projectManager.CloudProjectInfo = {
  project: "projects/my-project-123",
  displayName: "my-project",
  locationId: "us-central",
};

const ANOTHER_CLOUD_PROJECT: projectManager.CloudProjectInfo = {
  project: "projects/another-project",
  displayName: "another-project",
  locationId: "us-central",
};

function generateFirebaseProjectList(counts: number): projectManager.FirebaseProjectMetadata[] {
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

function generateCloudProjectList(counts: number): projectManager.CloudProjectInfo[] {
  return Array.from(Array(counts), (_, i: number) => ({
    project: `projects/project-id-${i}`,
    displayName: `Project ${i}`,
    locationId: `location-${i}`,
  }));
}

describe("Project management", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation").throws("Unexpected poll call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Interactive flows", () => {
    let promptOnceStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox.stub(prompt, "prompt").throws("Unexpected prompt call");
      promptOnceStub = sandbox.stub(prompt, "promptOnce").throws("Unexpected promptOnce call");
    });

    describe("getOrPromptProject", () => {
      it("should get project from list if it is able to list all projects", async () => {
        const options = {};
        apiRequestStub.onFirstCall().resolves({
          body: {
            results: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
          },
        });
        promptOnceStub.resolves("my-project-123");

        const project = await projectManager.getOrPromptProject(options);

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
      });

      it("should prompt project id if it is not able to list all projects", async () => {
        const options = {};
        apiRequestStub
          .onFirstCall()
          .resolves({
            body: {
              results: [TEST_FIREBASE_PROJECT, ANOTHER_FIREBASE_PROJECT],
              nextPageToken: "token",
            },
          })
          .onSecondCall()
          .resolves({ body: TEST_FIREBASE_PROJECT });
        promptOnceStub.resolves("my-project-123");

        const project = await projectManager.getOrPromptProject(options);

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("input");
      });

      it("should throw if there's no project", async () => {
        const options = {};
        apiRequestStub.onFirstCall().resolves({ body: { results: [] } });

        let err;
        try {
          await projectManager.getOrPromptProject(options);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "There are no Firebase projects associated with this account."
        );
        expect(promptOnceStub).to.be.not.called;
      });

      it("should get the correct project info when --project is supplied", async () => {
        const options = { project: "my-project-123" };
        apiRequestStub.resolves({ body: TEST_FIREBASE_PROJECT });

        const project = await projectManager.getOrPromptProject(options);

        expect(project).to.deep.equal(TEST_FIREBASE_PROJECT);
        expect(promptOnceStub).to.be.not.called;
      });

      it("should throw error when getFirebaseProject throw an error", async () => {
        const options = { project: "my-project-123" };
        const expectedError = new Error("Failed to get project");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.getOrPromptProject(options);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to get Firebase project my-project-123" +
            ". Please make sure the project exists and your account has permission to access it."
        );
        expect(err.original).to.equal(expectedError);
        expect(promptOnceStub).to.be.not.called;
      });
    });

    describe("promptAvailableProjectId", () => {
      it("should select project from list if it is able to list all projects", async () => {
        apiRequestStub.onFirstCall().resolves({
          body: {
            projectInfo: [TEST_CLOUD_PROJECT, ANOTHER_CLOUD_PROJECT],
          },
        });
        promptOnceStub.resolves("my-project-123");

        const projectId = await projectManager.promptAvailableProjectId();

        expect(projectId).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("list");
      });

      it("should prompt project id if it is not able to list all projects", async () => {
        apiRequestStub.onFirstCall().resolves({
          body: {
            projectInfo: [TEST_CLOUD_PROJECT, ANOTHER_CLOUD_PROJECT],
            nextPageToken: "token",
          },
        });
        promptOnceStub.resolves("my-project-123");

        const projectId = await projectManager.promptAvailableProjectId();

        expect(projectId).to.deep.equal("my-project-123");
        expect(promptOnceStub).to.be.calledOnce;
        expect(promptOnceStub.firstCall.args[0].type).to.equal("input");
      });

      it("should throw if there's no project", async () => {
        apiRequestStub.onFirstCall().resolves({ body: { projectInfo: [] } });

        let err;
        try {
          await projectManager.promptAvailableProjectId();
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "There are no available Google Cloud projects to add Firebase services."
        );
        expect(promptOnceStub).to.be.not.called;
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
        apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
        pollOperationStub.onFirstCall().resolves(expectedProjectInfo);

        const resultProjectInfo = await projectManager.createCloudProject(PROJECT_ID, {
          displayName: PROJECT_NAME,
          parentResource: PARENT_RESOURCE,
        });

        expect(resultProjectInfo).to.equal(expectedProjectInfo);
        expect(apiRequestStub).to.be.calledOnceWith("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        });
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Project Creation Poller",
          apiOrigin: api.resourceManagerOrigin,
          apiVersion: "v1",
          operationResourceName: OPERATION_RESOURCE_NAME_1,
        });
      });

      it("should reject if Cloud project creation fails", async () => {
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.createCloudProject(PROJECT_ID, {
            displayName: PROJECT_NAME,
            parentResource: PARENT_RESOURCE,
          });
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to create project. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        });
        expect(pollOperationStub).to.be.not.called;
      });

      it("should reject if Cloud project creation polling throws error", async () => {
        const expectedError = new Error("Entity already exists");
        apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
        pollOperationStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.createCloudProject(PROJECT_ID, {
            displayName: PROJECT_NAME,
            parentResource: PARENT_RESOURCE,
          });
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to create project. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith("POST", "/v1/projects", {
          auth: true,
          origin: api.resourceManagerOrigin,
          timeout: 15000,
          data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
        });
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
        apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } });
        pollOperationStub
          .onFirstCall()
          .resolves({ projectId: PROJECT_ID, displayName: PROJECT_NAME });

        const resultProjectInfo = await projectManager.addFirebaseToCloudProject(PROJECT_ID);

        expect(resultProjectInfo).to.deep.equal(expectFirebaseProjectInfo);
        expect(apiRequestStub).to.be.calledOnceWith(
          "POST",
          `/v1beta1/projects/${PROJECT_ID}:addFirebase`,
          {
            auth: true,
            origin: api.firebaseApiOrigin,
            timeout: 15000,
          }
        );
        expect(pollOperationStub).to.be.calledOnceWith({
          pollerName: "Add Firebase Poller",
          apiOrigin: api.firebaseApiOrigin,
          apiVersion: "v1beta1",
          operationResourceName: OPERATION_RESOURCE_NAME_2,
        });
      });

      it("should reject if add Firebase api call fails", async () => {
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.addFirebaseToCloudProject(PROJECT_ID);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith(
          "POST",
          `/v1beta1/projects/${PROJECT_ID}:addFirebase`,
          {
            auth: true,
            origin: api.firebaseApiOrigin,
            timeout: 15000,
          }
        );
        expect(pollOperationStub).to.be.not.called;
      });

      it("should reject if polling add Firebase operation throws error", async () => {
        const expectedError = new Error("Permission denied");
        apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } });
        pollOperationStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.addFirebaseToCloudProject(PROJECT_ID);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith(
          "POST",
          `/v1beta1/projects/${PROJECT_ID}:addFirebase`,
          {
            auth: true,
            origin: api.firebaseApiOrigin,
            timeout: 15000,
          }
        );
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
        apiRequestStub.onFirstCall().resolves({
          body: { projectInfo: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN },
        });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          "/v1beta1/availableProjects?pageSize=10",
          {
            auth: true,
            origin: api.firebaseApiOrigin,
            timeout: 30000,
          }
        );
      });

      it("should resolve with a project page if it succeeds (with input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateCloudProjectList(pageSize);
        apiRequestStub.onFirstCall().resolves({
          body: { projectInfo: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN },
        });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize, PAGE_TOKEN);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          `/v1beta1/availableProjects?pageSize=10&pageToken=${PAGE_TOKEN}`
        );
      });

      it("should resolve with a project page if it succeeds with no next page token", async () => {
        const pageSize = 10;
        const projectCounts = 5;
        const expectedProjectList = generateCloudProjectList(projectCounts);
        apiRequestStub.onFirstCall().resolves({
          body: { projectInfo: expectedProjectList },
        });

        const projectPage = await projectManager.getAvailableCloudProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.be.undefined;
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          "/v1beta1/availableProjects?pageSize=10"
        );
      });

      it("should reject if the api call fails", async () => {
        const pageSize = 100;
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.getAvailableCloudProjectPage(pageSize, PAGE_TOKEN);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list available Google Cloud Platform projects. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          `/v1beta1/availableProjects?pageSize=100&pageToken=${PAGE_TOKEN}`
        );
      });
    });

    describe("getFirebaseProjectPage", () => {
      it("should resolve with a project page if it succeeds (no input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateFirebaseProjectList(pageSize);
        apiRequestStub.onFirstCall().resolves({
          body: { results: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN },
        });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(apiRequestStub).to.be.calledOnceWith("GET", "/v1beta1/projects?pageSize=10", {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        });
      });

      it("should resolve with a project page if it succeeds (with input token)", async () => {
        const pageSize = 10;
        const expectedProjectList = generateFirebaseProjectList(pageSize);
        apiRequestStub.onFirstCall().resolves({
          body: { results: expectedProjectList, nextPageToken: NEXT_PAGE_TOKEN },
        });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize, PAGE_TOKEN);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.equal(NEXT_PAGE_TOKEN);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          `/v1beta1/projects?pageSize=10&pageToken=${PAGE_TOKEN}`
        );
      });

      it("should resolve with a project page if it succeeds with no next page token", async () => {
        const pageSize = 10;
        const projectCounts = 5;
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        apiRequestStub.onFirstCall().resolves({
          body: { results: expectedProjectList },
        });

        const projectPage = await projectManager.getFirebaseProjectPage(pageSize);

        expect(projectPage.projects).to.deep.equal(expectedProjectList);
        expect(projectPage.nextPageToken).to.be.undefined;
        expect(apiRequestStub).to.be.calledOnceWith("GET", "/v1beta1/projects?pageSize=10");
      });

      it("should reject if the api call fails", async () => {
        const pageSize = 100;
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.getFirebaseProjectPage(pageSize, PAGE_TOKEN);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith(
          "GET",
          `/v1beta1/projects?pageSize=100&pageToken=${PAGE_TOKEN}`
        );
      });
    });

    describe("listFirebaseProjects", () => {
      it("should resolve with project list if it succeeds with only 1 api call", async () => {
        const projectCounts = 10;
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        apiRequestStub.onFirstCall().resolves({
          body: { results: expectedProjectList },
        });

        const projects = await projectManager.listFirebaseProjects();

        expect(projects).to.deep.equal(expectedProjectList);
        expect(apiRequestStub).to.be.calledOnceWith("GET", "/v1beta1/projects?pageSize=1000", {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        });
      });

      it("should concatenate pages to get project list if it succeeds with multiple api calls", async () => {
        const projectCounts = 10;
        const pageSize = 5;
        const nextPageToken = "next-page-token";
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        apiRequestStub
          .onFirstCall()
          .resolves({
            body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
          })
          .onSecondCall()
          .resolves({ body: { results: expectedProjectList.slice(pageSize, projectCounts) } });

        const projects = await projectManager.listFirebaseProjects(pageSize);

        expect(projects).to.deep.equal(expectedProjectList);
        expect(apiRequestStub).to.be.calledTwice;
        expect(apiRequestStub.firstCall).to.be.calledWith(
          "GET",
          `/v1beta1/projects?pageSize=${pageSize}`
        );
        expect(apiRequestStub.secondCall).to.be.calledWith(
          "GET",
          `/v1beta1/projects?pageSize=${pageSize}&pageToken=${nextPageToken}`
        );
      });

      it("should reject if the first api call fails", async () => {
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.listFirebaseProjects();
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith("GET", "/v1beta1/projects?pageSize=1000");
      });

      it("should reject if error is thrown in subsequence api call", async () => {
        const projectCounts = 10;
        const pageSize = 5;
        const nextPageToken = "next-page-token";
        const expectedProjectList = generateFirebaseProjectList(projectCounts);
        const expectedError = new Error("HTTP Error 400: unexpected error");
        apiRequestStub.onFirstCall().resolves({
          body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
        });
        apiRequestStub.onSecondCall().rejects(expectedError);

        let err;
        try {
          await projectManager.listFirebaseProjects(pageSize);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          "Failed to list Firebase projects. See firebase-debug.log for more info."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub.firstCall).to.be.calledWith(
          "GET",
          `/v1beta1/projects?pageSize=${pageSize}`
        );
        expect(apiRequestStub.secondCall).to.be.calledWith(
          "GET",
          `/v1beta1/projects?pageSize=${pageSize}&pageToken=${nextPageToken}`
        );
      });
    });

    describe("getFirebaseProject", () => {
      it("should resolve with project information if it succeeds", async () => {
        const expectedProjectInfo: projectManager.FirebaseProjectMetadata = {
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
        apiRequestStub.onFirstCall().resolves({ body: expectedProjectInfo });

        const projects = await projectManager.getFirebaseProject(PROJECT_ID);

        expect(projects).to.deep.equal(expectedProjectInfo);
        expect(apiRequestStub).to.be.calledOnceWith("GET", `/v1beta1/projects/${PROJECT_ID}`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        });
      });

      it("should reject if the api call fails", async () => {
        const expectedError = new Error("HTTP Error 404: Not Found");
        apiRequestStub.onFirstCall().rejects(expectedError);

        let err;
        try {
          await projectManager.getFirebaseProject(PROJECT_ID);
        } catch (e) {
          err = e;
        }

        expect(err.message).to.equal(
          `Failed to get Firebase project ${PROJECT_ID}. ` +
            "Please make sure the project exists and your account has permission to access it."
        );
        expect(err.original).to.equal(expectedError);
        expect(apiRequestStub).to.be.calledOnceWith("GET", `/v1beta1/projects/${PROJECT_ID}`, {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        });
      });
    });
  });
});
