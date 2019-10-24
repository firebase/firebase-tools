import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import { FirebaseError } from "../error";
import { OperationPollerOptions, pollOperation } from "../operation-poller";
import TimeoutError from "../throttler/errors/timeout-error";
import { mockAuth } from "./helpers";

const TEST_ORIGIN = "https://firebasedummy.googleapis.com.com";
const VERSION = "v1";
const LRO_RESOURCE_NAME = "operations/cp.3322442424242444";
const FULL_RESOURCE_NAME = `/${VERSION}/${LRO_RESOURCE_NAME}`;
const API_OPTIONS = { auth: true, origin: TEST_ORIGIN };

describe("OperationPoller", () => {
  describe("poll", () => {
    let sandbox: sinon.SinonSandbox;
    let stubApiRequest: sinon.SinonStub;
    let pollerOptions: OperationPollerOptions;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      mockAuth(sandbox);
      stubApiRequest = sandbox.stub(api, "request");
      pollerOptions = {
        apiOrigin: TEST_ORIGIN,
        apiVersion: VERSION,
        operationResourceName: LRO_RESOURCE_NAME,
        backoff: 10,
      };
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should return result with response field if polling succeeds", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };

      stubApiRequest
        .withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS)
        .resolves({ body: successfulResponse });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(stubApiRequest.callCount).to.equal(1);
    });

    it("should return result with error field if polling operation returns failure response", async () => {
      const failedResponse = {
        done: true,
        error: {
          message: "failed",
          code: 7,
        },
      };
      stubApiRequest
        .withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS)
        .resolves({ body: failedResponse });

      let err;
      try {
        await pollOperation<string>(pollerOptions);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal("failed");
      expect(err.status).to.equal(7);
      expect(stubApiRequest.callCount).to.equal(1);
    });

    it("should return result with error field if api call rejects with unrecoverable error", async () => {
      const unrecoverableError = new FirebaseError("poll failed", { status: 404 });

      stubApiRequest.withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS).rejects(unrecoverableError);

      let err;
      try {
        await pollOperation<string>(pollerOptions);
      } catch (e) {
        err = e;
      }
      expect(err).to.equal(unrecoverableError);
      expect(stubApiRequest.callCount).to.equal(1);
    });

    it("should retry polling if http request responds with 500 or 503 status code", async () => {
      const retriableError1 = new FirebaseError("poll failed", { status: 500 });
      const retriableError2 = new FirebaseError("poll failed", { status: 503 });
      const successfulResponse = {
        done: true,
        response: "completed",
      };

      stubApiRequest
        .withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS)
        .onFirstCall()
        .rejects(retriableError1)
        .onSecondCall()
        .rejects(retriableError2)
        .onThirdCall()
        .resolves({ body: successfulResponse });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(stubApiRequest.callCount).to.equal(3);
    });

    it("should retry polling until the LRO is done", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      stubApiRequest
        .withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS)
        .resolves({ done: false })
        .onThirdCall()
        .resolves({ body: successfulResponse });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(stubApiRequest.callCount).to.equal(3);
    });

    it("should reject with TimeoutError when timed out after failed retries", async () => {
      pollerOptions.masterTimeout = 200;
      stubApiRequest.withArgs("GET", FULL_RESOURCE_NAME, API_OPTIONS).resolves({ done: false });

      let error;
      try {
        await pollOperation<string>(pollerOptions);
      } catch (err) {
        error = err;
      }
      expect(error).to.be.instanceOf(TimeoutError);
      expect(stubApiRequest.callCount).to.be.at.least(3);
    });
  });
});
