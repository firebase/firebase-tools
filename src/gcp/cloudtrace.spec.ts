import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import * as cloudtrace from "./cloudtrace";
import { cloudTraceOrigin } from "../api";
import { FirebaseError } from "../error";

describe("cloudtrace", () => {
  let clock: sinon.SinonFakeTimers;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  afterEach(() => {
    clock.restore();
    nock.cleanAll();
  });

  describe("provisionTraceStorage", () => {
    it("should send a welcome span to batchWrite endpoint", async () => {
      const batchWriteReq = nock(cloudTraceOrigin())
        .post("/v2/projects/test-project/traces:batchWrite", {
          name: "projects/test-project",
          spans: [
            {
              name: "projects/test-project/traces/33fc0d8c45bb4e5cebb29f047931270d/spans/f8fde40b437488e5",
              spanId: "f8fde40b437488e5",
              displayName: { value: "/welcome" },
              startTime: "2026-01-01T00:00:00.000Z",
              endTime: "2026-01-01T00:00:01.000Z",
            },
          ],
        })
        .reply(200, {});

      await cloudtrace.provisionTraceStorage("test-project");

      expect(batchWriteReq.isDone()).to.be.true;
    });

    it("should throw a FirebaseError when batchWrite fails", async () => {
      nock(cloudTraceOrigin())
        .post("/v2/projects/test-project/traces:batchWrite")
        .reply(500, { error: { message: "Internal error" } });

      await expect(cloudtrace.provisionTraceStorage("test-project")).to.be.rejectedWith(
        FirebaseError,
        "Failed to provision trace storage for project test-project: Request to https://cloudtrace.googleapis.com/v2/projects/test-project/traces:batchWrite had HTTP Error: 500, Internal error",
      );
    });
  });
});
