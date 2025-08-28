import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { addNote } from "./addNote";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;
describe("addNote", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test-issue-id";
  const note = "This is a test note.";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve with the response body on success", async () => {
    const mockResponse = { name: "note1", body: note };

    nock(crashlyticsApiOrigin())
      .post(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`, {
        body: note,
      })
      .reply(200, mockResponse);

    const result = await addNote(appId, issueId, note);

    expect(result).to.deep.equal(mockResponse);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    nock(crashlyticsApiOrigin())
      .post(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`)
      .reply(500, { error: "Internal Server Error" });

    await expect(addNote(appId, issueId, note)).to.be.rejectedWith(
      FirebaseError,
      `Failed to add note to issue ${issueId} for app ${appId}.`,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(addNote(invalidAppId, issueId, note)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
