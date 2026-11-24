import { expect } from "chai";
import * as sinon from "sinon";
import { Headers as NodeFetchHeaders } from "node-fetch";
import * as apiv2 from "../../apiv2";
import { FirebaseError } from "../../error";
import { FBToolsAuthClient } from "./fbToolsAuthClient";

describe("FBToolsAuthClient", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("returns Web standard Headers with Bearer token from getRequestHeaders()", async () => {
    sandbox.stub(apiv2, "getAccessToken").resolves("test-token");
    const client = new FBToolsAuthClient();

    const headers = await client.getRequestHeaders();

    expect(headers).to.be.instanceOf(Headers);
    expect(headers.get("authorization")).to.equal("Bearer test-token");
  });

  it("throws FirebaseError when opts.url is missing", async () => {
    const client = new FBToolsAuthClient();
    await expect(client.request({})).to.be.rejectedWith(FirebaseError, "opts.url was undefined");
  });

  it("delegates request() through apiv2.Client and returns a GaxiosResponse", async () => {
    const reqStub = sandbox.stub(apiv2.Client.prototype, "request").resolves({
      status: 200,
      body: { connectionName: "proj:reg:inst" },
      response: {
        status: 200,
        statusText: "OK",
        headers: new NodeFetchHeaders({ "x-custom": "val" }),
      } as unknown as apiv2.ClientResponse<unknown>["response"],
    });

    const client = new FBToolsAuthClient();
    const res = await client.request<{ connectionName: string }>({
      url: "https://sqladmin.googleapis.com/sql/v1beta4/projects/p/instances/i",
      method: "GET",
      headers: { "x-req": "1" },
    });

    expect(reqStub.calledOnce).to.be.true;
    expect(res.status).to.equal(200);
    expect(res.data).to.deep.equal({ connectionName: "proj:reg:inst" });
    expect(res.headers).to.be.instanceOf(Headers);
    expect(res.headers.get("x-custom")).to.equal("val");
    expect(res.config.url).to.be.instanceOf(URL);
    expect(res.config.headers).to.be.instanceOf(Headers);
    expect(res.config.headers.get("x-req")).to.equal("1");
  });
});
