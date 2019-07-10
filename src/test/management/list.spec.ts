import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import { listFirebaseProjects } from "../../management/list";
import { FirebaseProjectMetadata } from "../../management/metadata";
import { mockAuth } from "../helpers";

function generateProjectList(counts: number): FirebaseProjectMetadata[] {
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

describe("list", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("listFirebaseProjects", () => {
    it("should resolve with project list if it succeeds with only 1 api call", async () => {
      const projectCounts = 10;
      const expectedProjectList = generateProjectList(projectCounts);
      apiRequestStub.onFirstCall().resolves({
        body: { results: expectedProjectList },
      });

      const projects = await listFirebaseProjects();

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
      const expectedProjectList = generateProjectList(projectCounts);
      apiRequestStub
        .onFirstCall()
        .resolves({
          body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
        })
        .onSecondCall()
        .resolves({ body: { results: expectedProjectList.slice(pageSize, projectCounts) } });

      const projects = await listFirebaseProjects(pageSize);

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
        await listFirebaseProjects();
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase projects. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith("GET", "/v1beta1/projects?pageSize=1000");
    });

    it("should rejects if error is thrown in subsequence api call", async () => {
      const projectCounts = 10;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedProjectList = generateProjectList(projectCounts);
      const expectedError = new Error("HTTP Error 400: unexpected error");
      apiRequestStub.onFirstCall().resolves({
        body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
      });
      apiRequestStub.onSecondCall().rejects(expectedError);

      let err;
      try {
        await listFirebaseProjects(pageSize);
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
});
