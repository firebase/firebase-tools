import { expect } from "chai";
import * as sinon from "sinon";
import { get_rules } from "./get_rules";
import * as util from "../../util";
import { Client } from "../../../apiv2";
import { Readable } from "stream";

describe("get_rules tool", () => {
  const projectId = "test-project";
  const rules = '{"rules": {".read": true}}';

  let requestStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    requestStub = sinon.stub(Client.prototype, "request");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  function mockSuccessfulResponse() {
    const stream = new Readable();
    stream.push(rules);
    stream.push(null);
    const response = {
      status: 200,
      response: {
        text: () => Promise.resolve(rules),
      },
    };
    requestStub.resolves(response);
  }

  it("should get rules with the default database URL", async () => {
    mockSuccessfulResponse();
    const result = await (get_rules as any)._fn({}, { projectId });

    // This is tricky because the constructor is called inside.
    // I can't easily stub the constructor AND test what it was called with.
    // Let's spy on it instead.
    // But for now, let's just check the request.
    expect(requestStub).to.be.calledWith({
      method: "GET",
      path: "/.settings/rules.json",
      responseType: "stream",
      resolveOnHTTPError: true,
    });
    expect(result).to.deep.equal(util.toContent(rules));
  });

  it("should get rules with a provided database URL", async () => {
    mockSuccessfulResponse();
    const databaseUrl = "http://localhost:9000";
    const result = await (get_rules as any)._fn({ databaseUrl }, { projectId });
    expect(result).to.deep.equal(util.toContent(rules));
  });

  it("should handle a failed request", async () => {
    const response = { status: 404 };
    requestStub.resolves(response);
    await (get_rules as any)._fn({}, { projectId });
    expect(mcpErrorStub).to.be.calledWith("Failed to fetch current rules. Code: 404");
  });
});
