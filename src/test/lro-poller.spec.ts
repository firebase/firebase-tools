import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import * as FirebaseError from "../error";
import { LroPoller, LroPollerOptions } from "../lro-poller";
import TimeoutError from "../throttler/errors/timeout-error";
import { mockAuth } from "./helpers";

const TEST_ORIGIN = "https://firebasedummy.googleapis.com.com";
const VERSION = "v1";
const LRO_RESOURCE_NAME = "operations/cp.3322442424242444";

describe("LroPoller", () => {
  describe("poll", () => {
    let sandbox: sinon.SinonSandbox;
    let stubApiRequest: sinon.SinonStub;
    let pollerOptions: LroPollerOptions;
    const poller = new LroPoller();

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
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .resolves({ body: successfulResponse });

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
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
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .resolves({ body: failedResponse });

      const response = await poller.poll(pollerOptions);
      expect(response.error.message).to.equal("failed");
      expect(response.error.status).to.equal(7);
      expect(stubApiRequest.callCount).to.equal(1);
    });

    it("should return result with error field if api call rejects with unrecoverable error", async () => {
      const unrecoverableError = new FirebaseError("poll failed", { status: 404 });

      stubApiRequest
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .rejects(unrecoverableError);

      const response = await poller.poll(pollerOptions);
      expect(response.error).to.equal(unrecoverableError);
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
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .onFirstCall()
        .rejects(retriableError1)
        .onSecondCall()
        .rejects(retriableError2)
        .onThirdCall()
        .resolves({ body: successfulResponse });

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
      expect(stubApiRequest.callCount).to.equal(3);
    });

    it("should retry polling until the LRO is done", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      stubApiRequest
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .resolves({ done: false })
        .onThirdCall()
        .resolves({ body: successfulResponse });

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
      expect(stubApiRequest.callCount).to.equal(3);
    });

    it("should reject with TimeoutError when timed out after failed retries", async () => {
      pollerOptions.masterTimeout = 200;
      stubApiRequest
        .withArgs("GET", `/${VERSION}/${LRO_RESOURCE_NAME}`, {
          auth: true,
          origin: TEST_ORIGIN,
        })
        .resolves({ done: false });

      let error;
      try {
        await poller.poll(pollerOptions);
      } catch (err) {
        error = err;
      }
      expect(error).to.be.instanceOf(TimeoutError);
      expect(stubApiRequest.callCount).to.be.at.least(3);
    });
  });
});
