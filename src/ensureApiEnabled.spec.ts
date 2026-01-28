import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";
import { configstore } from "./configstore";
import { check, ensure, POLL_SETTINGS } from "./ensureApiEnabled";

const FAKE_PROJECT_ID = "my_project";
const FAKE_API = "myapi.googleapis.com";
const FAKE_CACHE: Record<string, Record<string, boolean>> = {
  my_project: { "myapi.googleapis.com": true },
};

describe("ensureApiEnabled", () => {
  describe("check", () => {
    const sandbox = sinon.createSandbox();
    let configstoreGetMock: sinon.SinonStub;
    let configstoreSetMock: sinon.SinonStub;
    before(() => {
      nock.disableNetConnect();
    });

    after(() => {
      nock.enableNetConnect();
    });

    beforeEach(() => {
      configstoreGetMock = sandbox.stub(configstore, "get");
      configstoreSetMock = sandbox.stub(configstore, "set");
    });

    afterEach(() => {
      sandbox.restore();
    });

    for (const prefix of ["", "https://", "http://"]) {
      it("should call the API to check if it's enabled", async () => {
        configstoreGetMock.returns(undefined);
        configstoreSetMock.returns(undefined);
        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .reply(200, { state: "ENABLED" });

        await check(FAKE_PROJECT_ID, prefix + FAKE_API, "", true);

        expect(nock.isDone()).to.be.true;
        expect(configstoreSetMock.calledWith(FAKE_PROJECT_ID, FAKE_API));
      });

      it("should return the value from the API", async () => {
        configstoreGetMock.returns(undefined);
        configstoreSetMock.returns(undefined);
        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "ENABLED" });

        await expect(check(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.eventually.be.true;

        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "DISABLED" });

        await expect(check(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.eventually.be.false;
      });
      it("should skip the API call if the enablement is saved in the cache", async () => {
        configstoreGetMock.returns(FAKE_CACHE);
        configstoreSetMock.returns(undefined);

        await expect(check(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.eventually.be.true;
      });
    }
  });

  describe("ensure", () => {
    const sandbox = sinon.createSandbox();
    let configstoreGetMock: sinon.SinonStub;
    let configstoreSetMock: sinon.SinonStub;
    const originalPollInterval = POLL_SETTINGS.pollInterval;
    const originalPollsBeforeRetry = POLL_SETTINGS.pollsBeforeRetry;
    beforeEach(() => {
      nock.disableNetConnect();
      POLL_SETTINGS.pollInterval = 0;
      POLL_SETTINGS.pollsBeforeRetry = 0; // Zero means "one check".

      configstoreGetMock = sandbox.stub(configstore, "get");
      configstoreSetMock = sandbox.stub(configstore, "set");
    });

    afterEach(() => {
      nock.enableNetConnect();
      POLL_SETTINGS.pollInterval = originalPollInterval;
      POLL_SETTINGS.pollsBeforeRetry = originalPollsBeforeRetry;
      sandbox.restore();
    });

    for (const prefix of ["", "https://", "http://"]) {
      it("should verify that the API is enabled, and stop if it is", async () => {
        configstoreGetMock.returns(undefined);
        configstoreSetMock.returns(undefined);
        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "ENABLED" });

        await expect(ensure(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.not.be.rejected;
      });

      it("should verify that the API is enabled (in the cache), and stop if it is", async () => {
        configstoreGetMock.returns(FAKE_CACHE);
        configstoreSetMock.returns(undefined);

        await expect(ensure(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.not.be.rejected;
      });

      it("should attempt to enable the API if it is not enabled", async () => {
        configstoreGetMock.returns(undefined);
        configstoreSetMock.returns(undefined);
        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "DISABLED" });

        nock("https://serviceusage.googleapis.com")
          .post(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}:enable`, (body) => !body)
          .once()
          .reply(200);

        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "ENABLED" });

        await expect(ensure(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.not.be.rejected;

        expect(nock.isDone()).to.be.true;
        expect(configstoreSetMock.calledWith(FAKE_PROJECT_ID, FAKE_API));
      });

      it("should retry enabling the API if it does not enable in time", async () => {
        configstoreGetMock.returns(undefined);
        configstoreSetMock.returns(undefined);
        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "DISABLED" });

        nock("https://serviceusage.googleapis.com")
          .post(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}:enable`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .twice()
          .reply(200);

        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "DISABLED" });

        nock("https://serviceusage.googleapis.com")
          .get(`/v1/projects/${FAKE_PROJECT_ID}/services/${FAKE_API}`)
          .matchHeader("x-goog-user-project", `projects/${FAKE_PROJECT_ID}`)
          .once()
          .reply(200, { state: "ENABLED" });

        await expect(ensure(FAKE_PROJECT_ID, prefix + FAKE_API, "", true)).to.not.be.rejected;

        expect(nock.isDone()).to.be.true;
      });
    }
  });
});
