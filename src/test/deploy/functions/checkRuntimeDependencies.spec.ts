import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";

import { logger } from "../../../logger";
import { configstore } from "../../../configstore";
import { checkRuntimeDependencies } from "../../../deploy/functions/checkRuntimeDependencies";
import { POLL_SETTINGS } from "../../../ensureApiEnabled";
import * as api from "../../../api";

describe("checkRuntimeDependencies()", () => {
  let restoreInterval: number;
  before(() => {
    restoreInterval = POLL_SETTINGS.pollInterval;
    POLL_SETTINGS.pollInterval = 0;
  });
  after(() => {
    POLL_SETTINGS.pollInterval = restoreInterval;
  });

  let sandbox: sinon.SinonSandbox;
  let logStub: sinon.SinonStub | null;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    logStub = sandbox.stub(logger, "warn");
  });

  afterEach(() => {
    expect(nock.isDone()).to.be.true;
    sandbox.restore();
    timeStub = null;
    logStub = null;
  });

  function mockServiceCheck(isEnabled = false): void {
    nock(api.serviceUsageOrigin)
      .get("/v1/projects/test-project/services/cloudbuild.googleapis.com")
      .reply(200, { state: isEnabled ? "ENABLED" : "DISABLED" });
  }

  function mockServiceEnableSuccess(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(200, {});
  }

  function mockServiceEnableBillingError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          details: [{ violations: [{ type: "serviceusage/billing-enabled" }] }],
        },
      });
  }

  function mockServiceEnablePermissionError(): void {
    nock(api.serviceUsageOrigin)
      .post("/v1/projects/test-project/services/cloudbuild.googleapis.com:enable")
      .reply(403, {
        error: {
          status: "PERMISSION_DENIED",
        },
      });
  }

  let timeStub: sinon.SinonStub | null;
  function stubTimes(warnAfter: number, errorAfter: number): void {
    timeStub = sandbox.stub(configstore, "get");
    timeStub.withArgs("motd.cloudBuildWarnAfter").returns(warnAfter);
    timeStub.withArgs("motd.cloudBuildErrorAfter").returns(errorAfter);
  }

  ["nodejs10", "nodejs12", "nodejs14"].forEach((runtime) => {
    describe(`with ${runtime}`, () => {
      describe("with cloudbuild service enabled", () => {
        beforeEach(() => {
          mockServiceCheck(true);
        });

        it("should succeed", async () => {
          stubTimes(Date.now() - 10000, Date.now() - 5000);

          await expect(checkRuntimeDependencies("test-project", runtime)).to.eventually.be
            .fulfilled;
          expect(logStub?.callCount).to.eq(0);
        });
      });

      describe("with cloudbuild service disabled, but enabling succeeds", () => {
        beforeEach(() => {
          mockServiceCheck(false);
          mockServiceEnableSuccess();
          mockServiceCheck(true);
        });

        it("should succeed", async () => {
          stubTimes(Date.now() - 10000, Date.now() - 5000);

          await expect(checkRuntimeDependencies("test-project", runtime)).to.eventually.be
            .fulfilled;
          expect(logStub?.callCount).to.eq(1); // enabling an api logs a warning
        });
      });

      describe("with cloudbuild service disabled, but enabling fails with billing error", () => {
        beforeEach(() => {
          mockServiceCheck(false);
          mockServiceEnableBillingError();
        });

        it("should error", async () => {
          stubTimes(Date.now() - 10000, Date.now() - 5000);

          await expect(checkRuntimeDependencies("test-project", runtime)).to.eventually.be.rejected;
        });
      });

      describe("with cloudbuild service disabled, but enabling fails with permission error", () => {
        beforeEach(() => {
          mockServiceCheck(false);
          mockServiceEnablePermissionError();
        });

        it("should error", async () => {
          stubTimes(Date.now() - 10000, Date.now() - 5000);

          await expect(checkRuntimeDependencies("test-project", runtime)).to.eventually.be.rejected;
        });
      });
    });
  });
});
