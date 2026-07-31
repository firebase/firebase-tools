import { expect } from "chai";
import * as nock from "nock";
import * as firestore from "./firestore";
import { firestoreOrigin } from "../api";

describe("firestore", () => {
  const PROJECT_ID = "test-project";
  const DATABASE_ID = "(default)";
  const COLLECTION_ID = "test-collection";
  const SUBCOLLECTION_ID = "sub-collection";
  const PARENT = "parent-collection/parent-doc";

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    expect(nock.isDone()).to.be.true;
    nock.enableNetConnect();
  });

  describe("queryCollection", () => {
    it("should query root collection correctly", async () => {
      nock(firestoreOrigin())
        .post(`/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery`, (body) => {
          return (
            body.structuredQuery &&
            body.structuredQuery.from &&
            body.structuredQuery.from[0].collectionId === COLLECTION_ID
          );
        })
        .reply(200, [{ document: { name: "doc1", fields: {} } }]);

      const result = await firestore.queryCollection(PROJECT_ID, {
        from: [{ collectionId: COLLECTION_ID, allDescendants: false }],
      });

      expect(result.documents).to.have.lengthOf(1);
    });

    // This test demonstrates the current behavior (failure to target correct URL for subcollection)
    // or rather, we want to SUPPORT querying subcollections.
    // Currently, there is no way to pass "parent" to queryCollection.
    // So we can't strict "reproduce" a failure of the function itself unless we try to pass an invalid collectionId
    // and see if it fails (but nock would catch it).
    // The "issue" is missing functionality.
    // I will add a test case that EXPECTS to query a subcollection, which will fail to compile or run until I implement it.
    // For now, I'll comment it out or skip it.
    it("should query subcollection correctly", async () => {
      nock(firestoreOrigin())
        .post(
          `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${PARENT}:runQuery`,
          (body) => {
            return (
              body.structuredQuery &&
              body.structuredQuery.from &&
              body.structuredQuery.from[0].collectionId === SUBCOLLECTION_ID
            );
          },
        )
        .reply(200, [{ document: { name: "doc2", fields: {} } }]);

      const result = await firestore.queryCollection(
        PROJECT_ID,
        {
          from: [{ collectionId: SUBCOLLECTION_ID, allDescendants: false }],
        },
        DATABASE_ID,
        undefined,
        PARENT,
      );

      expect(result.documents).to.have.lengthOf(1);
    });
  });
});
