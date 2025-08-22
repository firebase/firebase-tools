import { expect } from "chai";
import * as sinon from "sinon";
import { rollback_template } from "./rollback_template";
import * as rcRollback from "../../../remoteconfig/rollback";
import * as util from "../../util";

describe("rollback_template tool", () => {
  const projectId = "test-project";
  const versionNumber = 123;
  const response = { etag: "etag-3" };

  let rollbackTemplateStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    rollbackTemplateStub = sinon.stub(rcRollback, "rollbackTemplate");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should rollback a template successfully", async () => {
    rollbackTemplateStub.resolves(response);
    const result = await (rollback_template as any)._fn(
      { version_number: versionNumber },
      { projectId },
    );
    expect(rollbackTemplateStub).to.be.calledWith(projectId, versionNumber);
    expect(result).to.deep.equal(util.toContent(response));
  });

  it("should return an error if no version number is provided", async () => {
    await (rollback_template as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith("No version number specified in the rollback requests");
  });
});
