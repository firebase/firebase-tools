import { expect } from "chai";
import * as nock from "nock";

import { LroPoller, LroPollerOptions } from "../lro-poller";
import TimeoutError from "../throttler/errors/timeout-error";

const TEST_ORIGIN = "https://firebasedummy.test.com";
const VERSION = "v1";
const LRO_RESOURCE_NAME = "operations/cp.3322442424242444";

describe("LroPoller", () => {
  describe("poll", () => {
    const poller = new LroPoller();
    let pollerOptions: LroPollerOptions;

    beforeEach(() => {
      pollerOptions = {
        apiOrigin: TEST_ORIGIN,
        apiVersion: VERSION,
        operationResourceName: LRO_RESOURCE_NAME,
        backoff: 10,
      };
    });

    afterEach(() => {
      nock.cleanAll();
    });

    it("should return result with response field if polling succeeds", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(200, successfulResponse);

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
      expect(nock.isDone()).to.be.true;
    });

    it("should return result with error field if polling operation returns failure response", async () => {
      const failedResponse = {
        done: true,
        error: {
          message: "failed",
          code: 7,
        },
      };
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(200, failedResponse);

      const response = await poller.poll(pollerOptions);
      expect(response.error.message).to.equal("failed");
      expect(response.error.status).to.equal(7);
      expect(nock.isDone()).to.be.true;
    });

    it("should return result with error field if api call rejects with unrecoverable error", async () => {
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(404, { context: { response: { statusCode: 404 } } });

      const response = await poller.poll(pollerOptions);
      expect(response.error.status).to.equal(404);
      expect(nock.isDone()).to.be.true;
    });

    it("should retry polling if http requests response with 500 or 503 status code", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(500, { context: { response: { statusCode: 500 } } })
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(503, { context: { response: { statusCode: 503 } } })
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(200, successfulResponse);

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
      expect(nock.isDone()).to.be.true;
    });

    it("should retry polling until the LRO is done", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .times(2)
        .reply(200, { done: false })
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(200, successfulResponse);

      expect(await poller.poll(pollerOptions)).to.deep.equal({ response: "completed" });
      expect(nock.isDone()).to.be.true;
    });

    it("should reject with TimeoutError when timed out after failed retries", async () => {
      const successfulResponse = {
        done: true,
        response: "completed",
      };
      pollerOptions.masterTimeout = 100;
      nock(TEST_ORIGIN)
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(500, { context: { response: { statusCode: 500 } } })
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .times(4)
        .reply(200, { done: false })
        .get(`/${VERSION}/${LRO_RESOURCE_NAME}`)
        .reply(200, successfulResponse);

      try {
        await poller.poll(pollerOptions);
      } catch (err) {
        expect(err).to.be.instanceOf(TimeoutError);
        expect(nock.isDone()).to.be.false;
      }
    });
  });
});
