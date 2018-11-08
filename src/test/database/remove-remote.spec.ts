"use strict";

import { expect } from "chai";
import { SinonSandbox } from "sinon";
import * as sinon from "sinon";
import * as nock from "nock";
import utils = require("../../utils");
import api = require("../../api");

import helpers = require("../helpers");
import RemoveRemote from "../../database/remove-remote";

describe("RemoveRemote", () => {
  const instance = "fake-db";
  const remote = new RemoveRemote(instance);
  const serverUrl = utils.addSubdomain(api.realtimeOrigin, instance);
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    helpers.mockAuth(sandbox);
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("listPath should work", (done) => {
    nock(serverUrl)
      .get("/.json")
      .query({ shallow: true, limitToFirst: "50000" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    expect(remote.listPath("/"))
      .to.eventually.eql(["a", "x", "f"])
      .notify(done);
  });

  it("prefetchTest should return empty", (done) => {
    nock(serverUrl)
      .get("/empty/path.json")
      .query({ timeout: "100ms" })
      .reply(200, null);
    expect(remote.prefetchTest("/empty/path"))
      .to.eventually.eql("empty")
      .notify(done);
  });

  it("prefetchTest should return large", (done) => {
    nock(serverUrl)
      .get("/large/path.json")
      .query({ timeout: "100ms" })
      .reply(400, {
        error:
          "Data requested exceeds the maximum size that can be accessed with a single request.",
      });
    expect(remote.prefetchTest("/large/path"))
      .to.eventually.eql("large")
      .notify(done);
  });

  it("prefetchTest should return small", (done) => {
    nock(serverUrl)
      .get("/small/path.json")
      .query({ timeout: "100ms" })
      .reply(200, {
        x: "some data",
      });
    expect(remote.prefetchTest("/small/path"))
      .to.eventually.eql("small")
      .notify(done);
  });

  it("deletePath should work", () => {
    nock(serverUrl)
      .delete("/a/b.json")
      .query({ print: "silent" })
      .reply(200, {});
    return remote.deletePath("/a/b");
  });
});
