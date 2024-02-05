import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import { OperationPollerOptions, pollOperation } from "../operation-poller";
import TimeoutError from "../throttler/errors/timeout-error";

const TEST_ORIGIN = "https://firebasedummy.googleapis.com.com";
const VERSION = "v1";
const LRO_RESOURCE_NAME = "operations/cp.3322442424242444";
const FULL_RESOURCE_NAME = `/${VERSION}/${LRO_RESOURCE_NAME}`;

describe("OperationPoller", () => {
  describe("poll", () => {
    let sandbox: sinon.SinonSandbox;
    let pollerOptions: OperationPollerOptions;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
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
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, { done: true, response: "completed" });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(nock.isDone()).to.be.true;
    });

    it("should return result with error field if polling operation returns failure response", async () => {
      nock(TEST_ORIGIN)
        .get(FULL_RESOURCE_NAME)
        .reply(200, {
          done: true,
          error: {
            message: "failed",
            code: 7,
          },
        });

      let err;
      try {
        await pollOperation<string>(pollerOptions);
      } catch (e: any) {
        err = e;
      }
      expect(err.message).to.equal("failed");
      expect(err.status).to.equal(7);
      expect(nock.isDone()).to.be.true;
    });

    it("should return result with error field if api call rejects with unrecoverable error", async () => {
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(404, { message: "poll failed" });

      await expect(pollOperation<string>(pollerOptions)).to.eventually.be.rejectedWith(
        FirebaseError,
        "404",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should retry polling if http request responds with 500 or 503 status code", async () => {
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(500, {});
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(503, {});
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, { done: true, response: "completed" });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(nock.isDone()).to.be.true;
    });

    it("should retry polling until the LRO is done", async () => {
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).twice().reply(200, { done: false });
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, { done: true, response: "completed" });

      expect(await pollOperation<string>(pollerOptions)).to.deep.equal("completed");
      expect(nock.isDone()).to.be.true;
    });

    it("should reject with TimeoutError when timed out after failed retries", async () => {
      pollerOptions.masterTimeout = 200;
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, { done: false }).persist();

      let error;
      try {
        await pollOperation<string>(pollerOptions);
      } catch (err: any) {
        error = err;
      }
      expect(error).to.be.instanceOf(TimeoutError);
      nock.cleanAll();
    });

    it("should call onPoll each time the operation is polled", async () => {
      const opResult = { done: true, response: "completed" };
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, { done: false });
      nock(TEST_ORIGIN).get(FULL_RESOURCE_NAME).reply(200, opResult);
      const onPollSpy = sinon.spy(() => {
        return;
      });
      pollerOptions.onPoll = onPollSpy;

      console.log(nock.pendingMocks());
      const res = await pollOperation<string>(pollerOptions);

      expect(res).to.deep.equal("completed");
      expect(onPollSpy).to.have.been.calledTwice;
      expect(onPollSpy).to.have.been.calledWith({ done: false });
      expect(onPollSpy).to.have.been.calledWith(opResult);
      expect(nock.isDone()).to.be.true;
    });
  });
});
