import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as utils from "../../utils";
import * as api from "../../api";

import * as helpers from "../helpers";
import { RTDBSizeRemote } from "../../database/sizeRemote";

describe("SizeRemote", () => {
  const instance = "fake-db";
  const remote = new RTDBSizeRemote(instance);
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

  it("should return consistent size results", async () => {
    const rootPayload = {
      a: "b",
      c: { d: "e" },
      f: { g: { h: "i" } },
    };
    nock(serverUrl)
      .get("/.json")
      .once()
      .query({ timeout: "1000ms" })
      .reply(200, rootPayload);

    const cPayload = {
      d: "e",
    };
    nock(serverUrl)
      .get("/c.json")
      .twice()
      .query({ timeout: "1000ms" })
      .reply(200, cPayload);

    const fPayload = {
      g: { h: "i" },
    };
    nock(serverUrl)
      .get("/f.json")
      .thrice()
      .query({ timeout: "1000ms" })
      .reply(200, fPayload);

    expect((await remote.sizeNode("/c", 1000)).bytes).to.be.below(
      (await remote.sizeNode("/f", 1000)).bytes
    );
    expect((await remote.sizeNode("/f", 1000)).bytes).to.be.below(
      (await remote.sizeNode("/", 1000)).bytes
    );
    expect((await remote.sizeNode("/f", 1000)).bytes).to.be.at.most(
      Buffer.byteLength(fPayload.toString())
    );
    expect((await remote.sizeNode("/c", 1000)).bytes).to.be.at.most(
      Buffer.byteLength(cPayload.toString())
    );
  });
});
