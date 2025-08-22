import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { deleteNote } from "./deleteNote";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("deleteNote", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test-issue-id";
  const noteId = "test-note-id";

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve on success", async () => {
    nock(crashlyticsApiOrigin())
      .delete(
        `/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
      )
      .reply(200, {});

    const result = await deleteNote(appId, issueId, noteId);

    expect(result).to.deep.equal(`Successfully deleted note ${noteId} from issue ${issueId}.`);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the API call fails", async () => {
    nock(crashlyticsApiOrigin())
      .delete(
        `/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
      )
      .reply(500, { error: "Internal Server Error" });

    await expect(deleteNote(appId, issueId, noteId)).to.be.rejectedWith(
      FirebaseError,
      `Failed to delete note ${noteId} from issue ${issueId} for app ${appId}.`,
    );
  });

  it("should throw a FirebaseError if the appId is invalid", async () => {
    const invalidAppId = "invalid-app-id";

    await expect(deleteNote(invalidAppId, issueId, noteId)).to.be.rejectedWith(
      FirebaseError,
      "Unable to get the projectId from the AppId.",
    );
  });
});
