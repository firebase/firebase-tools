import { expect } from "chai";
import * as sinon from "sinon";
import * as cloudlogging from "../../gcp/cloudlogging";
import { logger } from "../../logger";

describe("cloudlogging", () => {
  describe("getApiFilter", () => {
    it("should return base api filter for v1 functions", () => {
      expect(cloudlogging.getApiFilter(false, undefined)).to.eq('resource.type="cloud_function"');
    });

    it("should return base api filter for v1&v2 functions", () => {
      expect(cloudlogging.getApiFilter(true, undefined)).to.eq(
        'resource.type="cloud_function" OR (resource.type="cloud_run_revision" AND labels."goog-managed-by"="cloudfunctions")'
      );
    });

    it("should return list api filter for v1 functions", () => {
      expect(cloudlogging.getApiFilter(false, "fn1,fn2")).to.eq(
        'resource.type="cloud_function"\n(resource.labels.function_name="fn1" OR resource.labels.function_name="fn2")'
      );
    });

    it("should return list api filter for v1&v2 functions", () => {
      expect(cloudlogging.getApiFilter(true, "fn1,fn2")).to.eq(
        'resource.type="cloud_function" OR (resource.type="cloud_run_revision" AND labels."goog-managed-by"="cloudfunctions")\n(resource.labels.function_name="fn1" OR resource.labels.service_name="fn1" OR resource.labels.function_name="fn2" OR resource.labels.service_name="fn2")'
      );
    });
  });

  describe("logEntries", () => {
    let sandbox: sinon.SinonSandbox;
    let loggerStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      loggerStub = sandbox.stub(logger, "info");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should log no entries", () => {
      cloudlogging.logEntries([]);

      expect(loggerStub).to.have.been.calledOnce;
      expect(loggerStub).to.be.calledWith("No log entries found.");
    });

    it("should log entries", () => {
      const entries: cloudlogging.LogEntry[] = [
        {
          logName: "log1",
          resource: {
            labels: {
              function_name: "fn1",
            },
          },
          receiveTimestamp: "0000000",
        },
        {
          logName: "log2",
          resource: {
            labels: {
              service_name: "fn2",
            },
          },
          receiveTimestamp: "0000000",
          timestamp: "1111",
          severity: "DEBUG",
          textPayload: "payload",
        },
      ];

      cloudlogging.logEntries(entries);

      expect(loggerStub).to.have.been.calledTwice;
      expect(loggerStub.firstCall).to.be.calledWith("1111", "D", "fn2:", "payload");
      expect(loggerStub.secondCall).to.be.calledWith("---", "?", "fn1:", "");
    });
  });
});
