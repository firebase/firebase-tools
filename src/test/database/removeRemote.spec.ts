import { expect } from "chai";
import * as nock from "nock";

import * as utils from "../../utils";
import { RTDBRemoveRemote } from "../../database/removeRemote";

describe("RemoveRemote", () => {
  const instance = "fake-db";
  const host = "https://firebaseio.com";
  const remote = new RTDBRemoveRemote(instance, host);
  const serverUrl = utils.getDatabaseUrl(host, instance, "");

  afterEach(() => {
    nock.cleanAll();
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
