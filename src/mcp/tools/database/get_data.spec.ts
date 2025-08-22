import { expect } from "chai";
import * as sinon from "sinon";
import { get_data } from "./get_data";
import * as util from "../../util";
import * as apiv2 from "../../../apiv2";
import * as streamConsumers from "node:stream/consumers";
import { Readable } from "stream";

describe("get_data tool", () => {
  const projectId = "test-project";
  const path = "/test/path";
  const data = '{"key":"value"}';

  let mcpErrorStub: sinon.SinonStub;
  let requestStub: sinon.SinonStub;
  let clientConstructorStub: sinon.SinonStub;
  let textStub: sinon.SinonStub;
  let loggerDebugStub: sinon.SinonStub;
  let mockHost: any;

  beforeEach(() => {
    mcpErrorStub = sinon.stub(util, "mcpError");
    requestStub = sinon.stub();
    clientConstructorStub = sinon.stub(apiv2, "Client").returns({
      request: requestStub,
    } as any);
    textStub = sinon.stub(streamConsumers, "text");
    loggerDebugStub = sinon.stub();
    mockHost = { logger: { debug: loggerDebugStub } };
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return an error if path does not start with '/'", async () => {
    await (get_data as any)._fn({ path: "no/slash" }, { projectId, host: mockHost });
    expect(mcpErrorStub).to.be.calledWith("paths must start with '/' (you passed ''no/slash')");
  });

  it("should throw an error when using the default database URL due to a bug", async () => {
    // The use of path.join("https://domain.com", "/path") results in "/path", which is an invalid URL.
    await expect((get_data as any)._fn({ path }, { projectId, host: mockHost })).to.be.rejected;
  });

  it("should fetch data using a provided database URL", async () => {
    const databaseUrl = "http://localhost:9000";
    const mockStream = new Readable();
    requestStub.resolves({ body: mockStream });
    textStub.resolves(data);

    const result = await (get_data as any)._fn(
      { path, databaseUrl },
      { projectId, host: mockHost },
    );

    expect(clientConstructorStub).to.be.calledWith({
      urlPrefix: "http://localhost:9000",
      auth: true,
    });
    expect(requestStub).to.be.calledWith({
      method: "GET",
      path: "/test/path.json",
      responseType: "stream",
      resolveOnHTTPError: true,
    });
    expect(textStub).to.be.calledWith(mockStream);
    expect(result).to.deep.equal(util.toContent(data));
  });
});
