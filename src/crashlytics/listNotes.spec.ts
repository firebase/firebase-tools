import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listNotes } from "./listNotes";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listNotes", () => {
  const projectId = "my-project";
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectId = "1234567890";
  const issueId = "test-issue-id";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const mockResponse = { notes: [{ name: "note1", body: "a note" }] };

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectId}/apps/${appId}/issues/${issueId}/notes`)
      .reply(200, mockResponse);

    const result = await listNotes(projectId, appId, issueId);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectId}/apps/${appId}/issues/${issueId}/notes`)
      .reply(500, { error: "Internal Server Error" });

    await expect(listNotes(projectId, appId, issueId)).to.be.rejectedWith(
      FirebaseError,
      `Failed to fetch notes for issue ${issueId} for app ${appId}.`,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(listNotes(projectId, invalidAppId, issueId)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
