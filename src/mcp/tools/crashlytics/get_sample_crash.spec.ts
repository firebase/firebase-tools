import { expect } from "chai";
import * as sinon from "sinon";
import { get_sample_crash } from "./get_sample_crash";
import * as getSampleCrash from "../../../crashlytics/getSampleCrash";
import * as util from "../../util";

describe("get_sample_crash tool", () => {
  const appId = "test-app-id";
  const issueId = "test-issue-id";
  const variantId = "test-variant-id";
  const sampleCrash = { id: "crash1" };

  let getSampleCrashStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getSampleCrashStub = sinon.stub(getSampleCrash, "getSampleCrash");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get a sample crash successfully", async () => {
    getSampleCrashStub.resolves([sampleCrash]);

    const result = await (get_sample_crash as any)._fn({
      app_id: appId,
      issue_id: issueId,
      variant_id: variantId,
      sample_count: 1,
    });

    expect(getSampleCrashStub).to.be.calledWith(appId, issueId, 1, variantId);
    expect(result).to.deep.equal(util.toContent([sampleCrash]));
  });

  it("should cap the sample_count at 3", async () => {
    await (get_sample_crash as any)._fn({ app_id: appId, issue_id: issueId, sample_count: 5 });
    expect(getSampleCrashStub).to.be.calledWith(appId, issueId, 3, undefined);
  });

  it("should use a default sample_count of 1", async () => {
    await (get_sample_crash as any)._fn({ app_id: appId, issue_id: issueId });
    expect(getSampleCrashStub).to.be.calledWith(appId, issueId, 1, undefined);
  });

  it("should return an error if app_id is not provided", async () => {
    await (get_sample_crash as any)._fn({ issue_id: issueId });
    expect(mcpErrorStub).to.be.calledWith("Must specify 'app_id' parameter.");
  });

  it("should return an error if issue_id is not provided", async () => {
    await (get_sample_crash as any)._fn({ app_id: appId });
    expect(mcpErrorStub).to.be.calledWith("Must specify 'issue_id' parameter.");
  });
});
