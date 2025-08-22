import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { listNotes } from "./listNotes";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("listNotes", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test-issue-id";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const mockResponse = { notes: [{ name: "note1", body: "a note" }] };
    const noteCount = 10;

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`)
      .query({
        page_size: `${noteCount}`,
      })
      .reply(200, mockResponse);

    const result = await listNotes(appId, issueId, noteCount);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    const noteCount = 10;

    nock(crashlyticsApiOrigin())
      .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`)
      .query({
        page_size: `${noteCount}`,
      })
      .reply(500, { error: "Internal Server Error" });

    await expect(listNotes(appId, issueId, noteCount)).to.be.rejectedWith(
      FirebaseError,
      `Failed to fetch notes for issue ${issueId} for app ${appId}.`,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";
    const noteCount = 10;

    await expect(listNotes(invalidAppId, issueId, noteCount)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
