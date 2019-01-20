import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as utils from "../../utils";
import * as api from "../../api";

import * as helpers from "../helpers";
import { RTDBRemoveRemote } from "../../database/removeRemote";

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

  it("should return subpaths from shallow get request", () => {
    nock(serverUrl)
      .get("/.json")
      .query({ shallow: true, limitToFirst: "1234" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    return expect(remote.listPath("/", 1234)).to.eventually.eql(["a", "x", "f"]);
  });

  it("should return true when patch is small", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(200, {});
    return expect(remote.deletePath("/a/b")).to.eventually.eql(true);
  });

  it("should return false whem patch is large", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(false);
  });

  it("should return true when multi-path patch is small", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(200, {});
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(true);
  });

  it("should return false when multi-path patch is large", () => {
    nock(serverUrl)
      .patch("/a/b.json")
      .query({ print: "silent", writeSizeLimit: "tiny" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    return expect(remote.deleteSubPath("/a/b", ["1", "2", "3"])).to.eventually.eql(false);
  });
});
