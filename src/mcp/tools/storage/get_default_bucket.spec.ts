import { expect } from "chai";
import * as sinon from "sinon";

import * as storage from "../../../gcp/storage";
import { McpContext } from "../../types";
import { mcpError, toContent } from "../../util";
import { getToolsByFeature } from "../index";
import { get_default_bucket } from "./get_default_bucket";

describe("get_default_bucket tool", () => {
  const projectId = "selected-project";
  const context = { projectId } as McpContext;
  const bucketError =
    "Unable to retrieve the default Firebase Storage bucket for the selected project.";
  let getDefaultBucketStub: sinon.SinonStub;

  beforeEach(() => {
    getDefaultBucketStub = sinon.stub(storage, "getDefaultBucket");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("is registered as a selected-project read with no input fields", async () => {
    const tools = await getToolsByFeature(["storage"]);
    const registered = tools.find((item) => item.mcp.name === "storage_get_default_bucket");

    expect(registered).to.exist;
    const inputSchema = registered?.mcp.inputSchema as Record<string, unknown>;
    expect(inputSchema).to.include({ type: "object" });
    expect(inputSchema).to.not.have.property("properties");
    expect(registered?.mcp._meta).to.include({ requiresProject: true, requiresAuth: true });
  });

  it("reads only the selected project's linked bucket name", async () => {
    getDefaultBucketStub.resolves("selected-project.firebasestorage.app");

    const result = await get_default_bucket.fn({}, context);

    expect(getDefaultBucketStub.calledOnceWithExactly(projectId)).to.be.true;
    expect(result).to.deep.equal(toContent("selected-project.firebasestorage.app"));
  });

  it("returns a bounded error for missing bucket and permission failures", async () => {
    for (const error of [new Error("bucket missing"), new Error("permission denied")]) {
      getDefaultBucketStub.rejects(error);

      const result = await get_default_bucket.fn({}, context);

      expect(result).to.deep.equal(mcpError(bucketError));
    }
    expect(getDefaultBucketStub.calledTwice).to.be.true;
  });

  it("returns a bounded error for empty or malformed responses", async () => {
    for (const value of [
      "",
      " ",
      undefined,
      { name: "unexpected" },
      "projects/other/buckets/name",
    ]) {
      getDefaultBucketStub.resolves(value);

      const result = await get_default_bucket.fn({}, context);

      expect(result).to.deep.equal(mcpError(bucketError));
    }
  });

  it("rejects extra caller input before requesting a bucket", async () => {
    const result = await get_default_bucket.fn({ projectId: "other-project" }, context);

    expect(result).to.deep.equal(mcpError("This tool accepts no arguments."));
    expect(getDefaultBucketStub.called).to.be.false;
  });
});
