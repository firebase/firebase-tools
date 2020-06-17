import { expect } from "chai";
import * as nock from "nock";

import * as utils from "../../utils";
import * as api from "../../api";
import { RTDBListRemote } from "../../database/listRemote";

describe("ListRemote", () => {
  const instance = "fake-db";
  const remote = new RTDBListRemote(instance);
  const serverUrl = utils.addSubdomain(api.realtimeOrigin, instance);

  afterEach(() => {
    nock.cleanAll();
  });

  it("should return subpaths from shallow get request", async () => {
    nock(serverUrl)
      .get("/.json")
      .query({ shallow: true, limitToFirst: "1234" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    await expect(remote.listPath("/", 1234)).to.eventually.eql(["a", "x", "f"]);
  });
});
