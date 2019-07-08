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

describe("listFirebaseProjects", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should resolve with project list if it succeeds with only 1 api call", async () => {
    const projectCounts = 10;
    const expectedProjectList = generateProjectList(projectCounts);
    const listProjectsStub = listProjectsApiStub().resolves({
      body: { results: expectedProjectList },
    });

    expect(await listFirebaseProjects()).to.deep.equal(expectedProjectList);
    expect(listProjectsStub).to.be.calledOnce;
  });

  it("should concatenate pages to get project list if it succeeds with multiple api calls", async () => {
    const projectCounts = 10;
    const pageSize = 5;
    const nextPageToken = "next-page-token";
    const expectedProjectList = generateProjectList(projectCounts);
    const firstCallStub = listProjectsApiStub(pageSize).resolves({
      body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
    });
    const secondCallStub = listProjectsApiStub(pageSize, nextPageToken).resolves({
      body: { results: expectedProjectList.slice(pageSize, projectCounts) },
    });

    expect(await listFirebaseProjects(pageSize)).to.deep.equal(expectedProjectList);
    expect(firstCallStub).to.be.calledOnce;
    expect(secondCallStub).to.be.calledOnce;
  });

  it("should reject if the first api call fails", async () => {
    const expectedError = new Error("HTTP Error 404: Not Found");
    const listProjectsStub = listProjectsApiStub().rejects(expectedError);

    let err;
    try {
      await listFirebaseProjects();
    } catch (e) {
      err = e;
    }
    expect(err.message).to.equal(
      "Failed to list Firebase project. See firebase-debug.log for more info."
    );
    expect(err.original).to.equal(expectedError);
    expect(listProjectsStub).to.be.calledOnce;
  });

  it("should rejects if error is thrown in subsequence api call", async () => {
    const projectCounts = 10;
    const pageSize = 5;
    const nextPageToken = "next-page-token";
    const expectedProjectList = generateProjectList(projectCounts);
    const expectedError = new Error("HTTP Error 400: unexpected error");
    const firstCallStub = listProjectsApiStub(pageSize).resolves({
      body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
    });
    const secondCallStub = listProjectsApiStub(pageSize, nextPageToken).rejects(expectedError);

    let err;
    try {
      await listFirebaseProjects(pageSize);
    } catch (e) {
      err = e;
    }
    expect(err.message).to.equal(
      "Failed to list Firebase project. See firebase-debug.log for more info."
    );
    expect(err.original).to.equal(expectedError);
    expect(firstCallStub).to.be.calledOnce;
    expect(secondCallStub).to.be.calledOnce;
  });

  function listProjectsApiStub(pageSize: number = 1000, nextPageToken?: string): sinon.SinonStub {
    const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
    return apiRequestStub.withArgs(
      "GET",
      `/v1beta1/projects?pageSize=${pageSize}${pageTokenQueryString}`,
      {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 30000,
      }
    );
  }
});
