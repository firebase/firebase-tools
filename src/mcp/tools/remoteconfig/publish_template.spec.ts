import { expect } from "chai";
import * as sinon from "sinon";
import { publish_template } from "./publish_template";
import * as rcPublish from "../../../remoteconfig/publish";
import * as util from "../../util";

describe("publish_template tool", () => {
  const projectId = "test-project";
  const template = { etag: "etag-1" };
  const response = { etag: "etag-2" };

  let publishTemplateStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    publishTemplateStub = sinon.stub(rcPublish, "publishTemplate");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should publish a template without force", async () => {
    publishTemplateStub.resolves(response);
    const result = await (publish_template as any)._fn({ template }, { projectId });
    expect(publishTemplateStub).to.be.calledWith(projectId, template);
    expect(result).to.deep.equal(util.toContent(response));
  });

  it("should publish a template with force", async () => {
    publishTemplateStub.resolves(response);
    const result = await (publish_template as any)._fn({ template, force: true }, { projectId });
    expect(publishTemplateStub).to.be.calledWith(projectId, template, { force: true });
    expect(result).to.deep.equal(util.toContent(response));
  });

  it("should return an error if no template is provided", async () => {
    await (publish_template as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith("No template specified in the publish requests");
  });
});
