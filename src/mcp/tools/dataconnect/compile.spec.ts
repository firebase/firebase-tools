import { expect } from "chai";
import * as sinon from "sinon";
import { compile } from "./compile";
import * as load from "../../../dataconnect/load";
import * as compileUtil from "../../util/dataconnect/compile";

describe("compile tool", () => {
  let sandbox: sinon.SinonSandbox;
  let pickServicesStub: sinon.SinonStub;
  let compileErrorsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pickServicesStub = sandbox
      .stub(load, "pickServices")
      .resolves([{ sourceDirectory: "/fake/dir1" } as any]);
    compileErrorsStub = sandbox.stub(compileUtil, "compileErrors");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should return successfully when there are no errors", async () => {
    compileErrorsStub.resolves(""); // No errors (returns empty string)

    const result = await compile.fn({ error_filter: "all" }, {
      projectId: "fake-project",
      config: {} as any,
    } as any);

    expect(pickServicesStub.calledOnce).to.be.true;
    expect(compileErrorsStub.calledOnceWith("/fake/dir1", "all")).to.be.true;
    expect(result).to.deep.equal({
      content: [{ type: "text", text: "Compiled successfully." }],
    });
  });

  it("should return formatted error list when compile errors exist", async () => {
    compileErrorsStub.resolves("Error: invalid syntax on line 12");

    const result = await compile.fn({ error_filter: "all" }, {
      projectId: "fake-project",
      config: {} as any,
    } as any);

    expect(pickServicesStub.calledOnce).to.be.true;
    expect(compileErrorsStub.calledOnceWith("/fake/dir1", "all")).to.be.true;
    expect(result.isError).to.be.true;
    expect((result.content[0] as { text: string }).text).to.include(
      "The following errors were encountered while compiling SQL Connect:\n\nError: invalid syntax on line 12",
    );
  });
});
