import { expect } from "chai";
import * as sinon from "sinon";
import { query_collection } from "./query_collection";
import * as firestore from "../../../gcp/firestore";
import { McpContext } from "../../types";

import { Config } from "../../../config";
import { RC } from "../../../rc";
import { FirebaseMcpServer } from "../../index";
import { StructuredQuery } from "../../../gcp/firestore";

describe("query_collection tool", () => {
  let sandbox: sinon.SinonSandbox;
  let queryCollectionStub: sinon.SinonStub;

  const mockContext = {
    projectId: "test-project",
    accountEmail: "test@example.com",
    config: {} as unknown as Config,
    host: {
      getEmulatorUrl: sinon.stub().resolves(undefined),
      logger: {
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
    } as unknown as FirebaseMcpServer,
    rc: {} as unknown as RC,
    firebaseCliCommand: "firebase",
    isBillingEnabled: true,
  } as unknown as McpContext;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    queryCollectionStub = sandbox.stub(firestore, "queryCollection").resolves({ documents: [] });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should parse valid collection path correctly", async () => {
    await query_collection.fn({ collection_path: "users" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
    expect(queryCollectionStub.firstCall.args[4]).to.be.undefined;
  });

  it("should parse subcollection path correctly", async () => {
    await query_collection.fn({ collection_path: "users/u1/posts" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("posts");
    expect(queryCollectionStub.firstCall.args[4]).to.equal("users/u1");
  });

  it("should handle trailing slashes", async () => {
    await query_collection.fn({ collection_path: "users/" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
  });

  it("should handle multiple trailing slashes", async () => {
    await query_collection.fn({ collection_path: "users//" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
  });

  it("should handle leading slashes", async () => {
    await query_collection.fn({ collection_path: "/users" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
  });

  it("should handle multiple leading slashes", async () => {
    await query_collection.fn({ collection_path: "//users" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
  });

  it("should handle both leading and trailing slashes", async () => {
    await query_collection.fn({ collection_path: "/users/" }, mockContext);
    expect(queryCollectionStub.calledOnce).to.be.true;
    const structuredQuery = queryCollectionStub.firstCall.args[1] as StructuredQuery;
    expect(structuredQuery.from[0].collectionId).to.equal("users");
  });

  it("should reject document paths", async () => {
    const result = await query_collection.fn({ collection_path: "users/u1" }, mockContext);
    expect(result.isError).to.be.true;
    const content = result.content[0];
    if (content && "text" in content && typeof content.text === "string") {
      expect(content.text).to.include("Path must point to a collection");
    } else {
      expect.fail("Expected text content");
    }
  });

  it("should reject empty paths", async () => {
    const result = await query_collection.fn({ collection_path: "" }, mockContext);
    expect(result.isError).to.be.true;
    const content = result.content[0];
    if (content && "text" in content && typeof content.text === "string") {
      expect(content.text).to.include("Must supply a non-empty collection path");
    } else {
      expect.fail("Expected text content");
    }
  });

  it("should reject paths that become empty after trimming", async () => {
    const result = await query_collection.fn({ collection_path: "  " }, mockContext);
    expect(result.isError).to.be.true;
    const content = result.content[0];
    if (content && "text" in content && typeof content.text === "string") {
      expect(content.text).to.include("Must supply a non-empty collection path");
    } else {
      expect.fail("Expected text content");
    }
  });

  it("should reject paths that become empty after cleaning slashes", async () => {
    const result = await query_collection.fn({ collection_path: "/" }, mockContext);
    expect(result.isError).to.be.true;
    const content = result.content[0];
    if (content && "text" in content && typeof content.text === "string") {
      expect(content.text).to.include("Must supply a non-empty collection path");
    } else {
      expect.fail("Expected text content");
    }
  });
});
