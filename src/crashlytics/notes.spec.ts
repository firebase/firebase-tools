import * as chai from "chai";
import * as nock from "nock";
import * as chaiAsPromised from "chai-as-promised";

import { createNote, deleteNote, listNotes } from "./notes";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("notes", () => {
  const appId = "1:1234567890:android:abcdef1234567890";
  const requestProjectNumber = "1234567890";
  const issueId = "test-issue-id";
  const noteId = "test-note-id";
  const noteBody = "This is a test note.";

  afterEach(() => {
    nock.cleanAll();
  });

  describe("createNote", () => {
    it("should resolve with the response body on success", async () => {
      const mockResponse = { name: `notes/${noteId}`, body: noteBody };

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`, {
          body: noteBody,
        })
        .reply(200, mockResponse);

      const result = await createNote(appId, issueId, noteBody);

      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      const invalidAppId = "invalid-app-id";

      await expect(createNote(invalidAppId, issueId, noteBody)).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("deleteNote", () => {
    it("should resolve on success", async () => {
      nock(crashlyticsApiOrigin())
        .delete(
          `/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
        )
        .reply(200, {});

      await deleteNote(appId, issueId, noteId);

      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      const invalidAppId = "invalid-app-id";

      await expect(deleteNote(invalidAppId, issueId, noteId)).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("listNotes", () => {
    it("should resolve with the response body on success", async () => {
      const mockResponse = { notes: [{ name: "note1", body: "a note" }] };
      const pageSize = 10;

      nock(crashlyticsApiOrigin())
        .get(`/v1alpha/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`)
        .query({
          page_size: `${pageSize}`,
        })
        .reply(200, mockResponse);

      const result = await listNotes(appId, issueId, pageSize);

      expect(result).to.deep.equal(mockResponse.notes);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      const invalidAppId = "invalid-app-id";
      const pageSize = 10;

      await expect(listNotes(invalidAppId, issueId, pageSize)).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });
});
