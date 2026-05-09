import { expect } from "chai";
import * as sinon from "sinon";
import { query_collection } from "./query_collection";
import * as firestore from "../../../gcp/firestore";
import { McpContext } from "../../types";

describe("query_collection tool", () => {
  const projectId = "test-project";
  const ctx = { projectId } as McpContext;

  let queryCollectionStub: sinon.SinonStub;

  beforeEach(() => {
    queryCollectionStub = sinon.stub(firestore, "queryCollection").resolves({ documents: [] });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("reference_value filter", () => {
    it("expands a relative document path to a full resource name", async () => {
      await query_collection.fn(
        {
          collection_path: "posts",
          filters: [
            {
              field: "author",
              op: "EQUAL",
              compare_value: { reference_value: "users/abc123" },
            },
          ],
          use_emulator: false,
        },
        ctx,
      );

      const [, structuredQuery] = queryCollectionStub.firstCall.args;
      expect(structuredQuery.where.compositeFilter.filters[0].fieldFilter.value).to.deep.equal({
        referenceValue: `projects/${projectId}/databases/(default)/documents/users/abc123`,
      });
    });

    it("respects a non-default database id when expanding the path", async () => {
      await query_collection.fn(
        {
          database: "my-db",
          collection_path: "posts",
          filters: [
            {
              field: "author",
              op: "EQUAL",
              compare_value: { reference_value: "users/abc123" },
            },
          ],
          use_emulator: false,
        },
        ctx,
      );

      const [, structuredQuery] = queryCollectionStub.firstCall.args;
      expect(structuredQuery.where.compositeFilter.filters[0].fieldFilter.value).to.deep.equal({
        referenceValue: `projects/${projectId}/databases/my-db/documents/users/abc123`,
      });
    });

    it("strips a leading slash from a relative document path", async () => {
      await query_collection.fn(
        {
          collection_path: "posts",
          filters: [
            {
              field: "author",
              op: "EQUAL",
              compare_value: { reference_value: "/users/abc123" },
            },
          ],
          use_emulator: false,
        },
        ctx,
      );

      const [, structuredQuery] = queryCollectionStub.firstCall.args;
      expect(structuredQuery.where.compositeFilter.filters[0].fieldFilter.value).to.deep.equal({
        referenceValue: `projects/${projectId}/databases/(default)/documents/users/abc123`,
      });
    });

    it("passes through a full resource name unchanged", async () => {
      const fullName = "projects/other-project/databases/(default)/documents/users/abc123";
      await query_collection.fn(
        {
          collection_path: "posts",
          filters: [
            {
              field: "author",
              op: "EQUAL",
              compare_value: { reference_value: fullName },
            },
          ],
          use_emulator: false,
        },
        ctx,
      );

      const [, structuredQuery] = queryCollectionStub.firstCall.args;
      expect(structuredQuery.where.compositeFilter.filters[0].fieldFilter.value).to.deep.equal({
        referenceValue: fullName,
      });
    });
  });
});
