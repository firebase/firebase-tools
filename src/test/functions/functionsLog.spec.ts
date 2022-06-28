/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { expect } from "chai";
import * as sinon from "sinon";
import * as functionsLog from "../../functions/functionslog";
import { logger } from "../../logger";

describe("functionsLog", () => {
  describe("getApiFilter", () => {
    it("should return base api filter for v1&v2 functions", () => {
      expect(functionsLog.getApiFilter(undefined)).to.eq(
        'resource.type="cloud_function" OR ' +
          '(resource.type="cloud_run_revision" AND ' +
          'labels."goog-managed-by"="cloudfunctions")'
      );
    });

    it("should return list api filter for v1&v2 functions", () => {
      expect(functionsLog.getApiFilter("fn1,fn2")).to.eq(
        'resource.type="cloud_function" OR ' +
          '(resource.type="cloud_run_revision" AND ' +
          'labels."goog-managed-by"="cloudfunctions")\n' +
          '(resource.labels.function_name="fn1" OR ' +
          'resource.labels.service_name="fn1" OR ' +
          'resource.labels.function_name="fn2" OR ' +
          'resource.labels.service_name="fn2")'
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
      functionsLog.logEntries([]);

      expect(loggerStub).to.have.been.calledOnce;
      expect(loggerStub).to.be.calledWith("No log entries found.");
    });

    it("should log entries", () => {
      const entries = [
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

      functionsLog.logEntries(entries);

      expect(loggerStub).to.have.been.calledTwice;
      expect(loggerStub.firstCall).to.be.calledWith("1111 D fn2: payload");
      expect(loggerStub.secondCall).to.be.calledWith("--- ? fn1: ");
    });
  });
});
