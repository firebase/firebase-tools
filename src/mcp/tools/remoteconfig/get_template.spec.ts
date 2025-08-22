import { expect } from "chai";
import * as sinon from "sinon";
import { get_template } from "./get_template";
import * as rcGet from "../../../remoteconfig/get";
import { toContent } from "../../util";

describe("get_template tool", () => {
  const projectId = "test-project";
  const template = { version: "1" };
  const versionNumber = "123";

  let getTemplateStub: sinon.SinonStub;

  beforeEach(() => {
    getTemplateStub = sinon.stub(rcGet, "getTemplate");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get the active template", async () => {
    getTemplateStub.resolves(template);
    const result = await (get_template as any)._fn({}, { projectId });
    expect(getTemplateStub).to.be.calledWith(projectId, undefined);
    expect(result).to.deep.equal(toContent(template));
  });

  it("should get a specific version of the template", async () => {
    getTemplateStub.resolves(template);
    const result = await (get_template as any)._fn(
      { version_number: versionNumber },
      { projectId },
    );
    expect(getTemplateStub).to.be.calledWith(projectId, versionNumber);
    expect(result).to.deep.equal(toContent(template));
  });
});
