import { expect } from "chai";
import * as sinon from "sinon";
import { set_data } from "./set_data";
import * as util from "../../util";
import * as apiv2 from "../../../apiv2";
import * as utils from "../../../utils";
import * as error from "../../../error";
import { Readable } from "stream";

describe("set_data tool", () => {
  const projectId = "test-project";
  const path = "/test/path";
  const data = '{"key":"value"}';

  let mcpErrorStub: sinon.SinonStub;
  let requestStub: sinon.SinonStub;
  let clientConstructorStub: sinon.SinonStub;
  let stringToStreamStub: sinon.SinonStub;
  let getErrMsgStub: sinon.SinonStub;
  let loggerDebugStub: sinon.SinonStub;
  let mockHost: any;

  beforeEach(() => {
    mcpErrorStub = sinon.stub(util, "mcpError");
    requestStub = sinon.stub();
    clientConstructorStub = sinon.stub(apiv2, "Client").returns({
      request: requestStub,
    } as any);
    stringToStreamStub = sinon.stub(utils, "stringToStream");
    getErrMsgStub = sinon.stub(error, "getErrMsg");
    loggerDebugStub = sinon.stub();
    mockHost = { logger: { debug: loggerDebugStub } };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return an error if path does not start with '/'", async () => {
    await (set_data as any)._fn({ path: "no/slash", data }, { projectId, host: mockHost });
    expect(mcpErrorStub).to.be.calledWith("paths must start with '/' (you passed ''no/slash')");
  });

  it("should throw an error when using the default database URL due to a bug", async () => {
    await expect((set_data as any)._fn({ path, data }, { projectId, host: mockHost })).to.be
      .rejected;
  });

  it("should write data using a provided database URL", async () => {
    const databaseUrl = "http://localhost:9000";
    const mockStream = new Readable();
    stringToStreamStub.returns(mockStream);
    requestStub.resolves();

    const result = await (set_data as any)._fn(
      { path, databaseUrl, data },
      { projectId, host: mockHost },
    );

    expect(clientConstructorStub).to.be.calledWith({
      urlPrefix: "http://localhost:9000",
      auth: true,
    });
    expect(stringToStreamStub).to.be.calledWith(data);
    expect(requestStub).to.be.calledWith({
      method: "PUT",
      path: "/test/path.json",
      body: mockStream,
    });
    expect(result).to.deep.equal(util.toContent("write successful!"));
  });

  it("should handle errors during the write request", async () => {
    const thrownError = new Error("Request failed");
    const errorMessage = "Parsed error message";
    requestStub.rejects(thrownError);
    getErrMsgStub.returns(errorMessage);

    await (set_data as any)._fn(
      { path, databaseUrl: "http://localhost:9000", data },
      { projectId, host: mockHost },
    );

    expect(getErrMsgStub).to.be.calledWith(thrownError);
    expect(mcpErrorStub).to.be.calledWith(`Unexpected error while setting data: ${errorMessage}`);
  });
});
