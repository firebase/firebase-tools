import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as utils from "../../utils";
import * as api from "../../api";

import * as helpers from "../helpers";
import { NodeSize, RTDBRemoveRemote } from "../../database/removeRemote";

describe("RemoveRemote", () => {
  const instance = "fake-db";
  const remote = new RTDBRemoveRemote(instance);
  const serverUrl = utils.addSubdomain(api.realtimeOrigin, instance);
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    helpers.mockAuth(sandbox);
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("listPath should work", () => {
    nock(serverUrl)
      .get("/.json")
      .query({ shallow: true, limitToFirst: "50000" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    return expect(remote.listPath("/")).to.eventually.eql(["a", "x", "f"]);
  });

  it("prefetchTest should return empty", () => {
    nock(serverUrl)
      .get("/empty/path.json")
      .query({ timeout: "100ms" })
      .reply(200, null);
    return expect(remote.prefetchTest("/empty/path")).to.eventually.eql(NodeSize.EMPTY);
  });

  it("prefetchTest should return large", () => {
    nock(serverUrl)
      .get("/large/path.json")
      .query({ timeout: "100ms" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    return expect(remote.prefetchTest("/large/path")).to.eventually.eql(NodeSize.LARGE);
  });

  it("prefetchTest should return small", () => {
    nock(serverUrl)
      .get("/small/path.json")
      .query({ timeout: "100ms" })
      .reply(200, {
        x: "some data",
      });
    return expect(remote.prefetchTest("/small/path")).to.eventually.eql(NodeSize.SMALL);
  });

  it("deletePath should work", () => {
    nock(serverUrl)
      .delete("/a/b.json")
      .query({ print: "silent" })
      .reply(200, {});
    return remote.deletePath("/a/b");
  });
});
