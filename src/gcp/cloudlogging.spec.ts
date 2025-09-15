import { expect } from "chai";
import * as nock from "nock";

import * as cloudlogging from "./cloudlogging";
import { FirebaseError } from "../error";
import { cloudloggingOrigin } from "../api";

describe("cloudlogging", () => {
  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe("listEntries", () => {
    it("should resolve with a list of log entries on success", async () => {
      const entries = [{ logName: "log1" }, { logName: "log2" }];
      nock(cloudloggingOrigin()).post("/v2/entries:list").reply(200, { entries });

      await expect(
        cloudlogging.listEntries("project", "filter", 10, "desc"),
      ).to.eventually.deep.equal(entries);
    });

    it("should reject if the API call fails", async () => {
      nock(cloudloggingOrigin()).post("/v2/entries:list").reply(404, { error: "not found" });

      await expect(cloudlogging.listEntries("project", "filter", 10, "desc")).to.be.rejectedWith(
        FirebaseError,
        "Failed to retrieve log entries from Google Cloud.",
      );
    });
  });
});
