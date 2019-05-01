import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as utils from "../../utils";
import * as api from "../../api";

import * as helpers from "../helpers";
import { cloudscheduler } from "../../gcp/";

const testJob = {
  name: "test",
  schedule: "every 5 minutes",
  httpTarget: {
    uri: "https://afakeone.come",
    httpMethod: "POST"
  }
}
describe("cloudscheduler", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should return subpaths from shallow get request", () => {
    nock(api.cloudschedulerOrigin)
      .get("/.json")
      .query({ shallow: true, limitToFirst: "1234" })
      .reply(200, {
        a: true,
        x: true,
        f: true,
      });
    return expect(cloudscheduler.createJob);
  });
});
