import { expect } from "chai";
import * as nock from "nock";

import { check, ensure, POLL_SETTINGS } from "../ensureApiEnabled";

const FAKE_PROJECT_ID = "my_project";
const FAKE_API = "myapi.googleapis.com";

describe("ensureApiEnabled", () => {
  describe("check", () => {
    before(() => {
      nock.disableNetConnect();
    });

    after(() => {
      nock.enableNetConnect();
    });

    it("should call the API to check if it's enabled", async () => {
      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .reply(200, { state: "ENABLED" });

      await check(FAKE_PROJECT_ID, FAKE_API, "", true);

      expect(nock.isDone()).to.be.true;
    });

    it("should return the value from the API", async () => {
      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "ENABLED" });

      await expect(check(FAKE_PROJECT_ID, FAKE_API, "", true)).to.eventually.be.true;

      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "DISABLED" });

      await expect(check(FAKE_PROJECT_ID, FAKE_API, "", true)).to.eventually.be.false;
    });
  });

  describe("ensure", () => {
    const originalPollInterval = POLL_SETTINGS.pollInterval;
    const originalPollsBeforeRetry = POLL_SETTINGS.pollsBeforeRetry;
    beforeEach(() => {
      nock.disableNetConnect();
      POLL_SETTINGS.pollInterval = 0;
      POLL_SETTINGS.pollsBeforeRetry = 0; // Zero means "one check".
    });

    afterEach(() => {
      nock.enableNetConnect();
      POLL_SETTINGS.pollInterval = originalPollInterval;
      POLL_SETTINGS.pollsBeforeRetry = originalPollsBeforeRetry;
    });

    it("should verify that the API is enabled, and stop if it is", async () => {
      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "ENABLED" });

      await expect(ensure(FAKE_PROJECT_ID, FAKE_API, "", true)).to.not.be.rejected;
    });

    it("should attempt to enable the API if it is not enabled", async () => {
      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "DISABLED" });

      nock("https://serviceusage.googleapis.com")
        .post(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}:enable`, (body) => !body)
        .once()
        .reply(200);

      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "ENABLED" });

      await expect(ensure(FAKE_PROJECT_ID, FAKE_API, "", true)).to.not.be.rejected;

      expect(nock.isDone()).to.be.true;
    });

    it("should retry enabling the API if it does not enable in time", async () => {
      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "DISABLED" });

      nock("https://serviceusage.googleapis.com")
        .post(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}:enable`)
        .twice()
        .reply(200);

      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "DISABLED" });

      nock("https://serviceusage.googleapis.com")
        .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
        .once()
        .reply(200, { state: "ENABLED" });

      await expect(ensure(FAKE_PROJECT_ID, FAKE_API, "", true)).to.not.be.rejected;

      expect(nock.isDone()).to.be.true;
    });
  });
});
