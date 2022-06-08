import { expect } from "chai";
import nock from "nock";

import * as utils from "../../utils.js";
import { realtimeOrigin } from "../../api.cjs";
import { RTDBListRemote } from "../../database/listRemote.js";
const HOST = "https://firebaseio.com";

describe("ListRemote", () => {
  const instance = "fake-db";
  const remote = new RTDBListRemote(instance, HOST);
  const serverUrl = utils.addSubdomain(realtimeOrigin, instance);

  afterEach(() => {
    nock.cleanAll();
  });

  it("should return subpaths from shallow get request", async () => {
    nock(serverUrl).get("/.json").query({ shallow: true, limitToFirst: "1234" }).reply(200, {
      a: true,
      x: true,
      f: true,
    });
    await expect(remote.listPath("/", 1234)).to.eventually.eql(["a", "x", "f"]);
  });
});
