import { expect } from "chai";
import * as nock from "nock";
import { appTestingOrigin } from "../api";
import { invokeTests, pollInvocationStatus } from "./invokeTests";
import { FirebaseError } from "../error";
import { Browser } from "./types";

describe("invokeTests", () => {
  describe("invokeTests", () => {
    const projectNumber = "123456789";
    const appId = `1:${projectNumber}:ios:abc123def456`;

    it("throws FirebaseError if invocation request fails", async () => {
      nock(appTestingOrigin())
        .post(`/v1alpha/projects/${projectNumber}/apps/${appId}/testInvocations:invokeTestCases`)
        .reply(400, { error: {} });
      await expect(invokeTests(appId, "https://www.example.com", [])).to.be.rejectedWith(
        FirebaseError,
        "Test invocation failed",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("returns operation when successful", async () => {
      nock(appTestingOrigin())
        .post(`/v1alpha/projects/${projectNumber}/apps/${appId}/testInvocations:invokeTestCases`)
        .reply(200, { name: "foo/bar/biz" });
      const operation = await invokeTests(appId, "https://www.example.com", []);
      expect(operation).to.eql({ name: "foo/bar/biz" });
      expect(nock.isDone()).to.be.true;
    });

    it("builds the correct request", async () => {
      let requestBody;
      nock(appTestingOrigin())
        .post(
          `/v1alpha/projects/${projectNumber}/apps/${appId}/testInvocations:invokeTestCases`,
          (r) => {
            requestBody = r;
            return true;
          },
        )
        .reply(200, { name: "foo/bar/biz" });

      await invokeTests(appId, "https://www.example.com", [
        {
          testCase: {
            startUri: "https://www.example.com",
            displayName: "testName1",
            steps: [{ goal: "test this app", hint: "try clicking the button" }],
          },
          testExecution: [{ config: { browser: Browser.CHROME } }],
        },
        {
          testCase: {
            startUri: "https://www.example.com",
            displayName: "testName2",
            steps: [{ goal: "retest it", finalScreenAssertion: "a dialog appears" }],
          },
          testExecution: [{ config: { browser: Browser.CHROME } }],
        },
      ]);

      expect(requestBody).to.eql({
        resource: {
          testCaseInvocations: [
            {
              testCase: {
                displayName: "testName1",
                steps: [
                  {
                    goal: "test this app",
                    hint: "try clicking the button",
                  },
                ],
                startUri: "https://www.example.com",
              },
              testExecution: [
                {
                  config: {
                    browser: "CHROME",
                  },
                },
              ],
            },
            {
              testCase: {
                displayName: "testName2",
                steps: [
                  {
                    goal: "retest it",
                    finalScreenAssertion: "a dialog appears",
                  },
                ],
                startUri: "https://www.example.com",
              },
              testExecution: [
                {
                  config: {
                    browser: "CHROME",
                  },
                },
              ],
            },
          ],
          testInvocation: {},
        },
      });
    });
  });

  describe("pollInvocationStatus", () => {
    const operationName = "operations/foo/bar";

    beforeEach(() => {
      nock(appTestingOrigin())
        .get(`/v1alpha/${operationName}`)
        .reply(200, { done: false, metadata: { count: 1 } });
      nock(appTestingOrigin())
        .get(`/v1alpha/${operationName}`)
        .reply(200, { done: false, metadata: { count: 2 } });
      nock(appTestingOrigin())
        .get(`/v1alpha/${operationName}`)
        .reply(200, { done: true, metadata: { count: 3 }, response: { foo: "12" } });
    });

    it("calls poll callback with metadata on each poll", async () => {
      const pollResponses: { [k: string]: any }[] = [];
      await pollInvocationStatus(
        operationName,
        (op) => {
          pollResponses.push(op.metadata!);
        },
        /* backoff= */ 1,
      );

      expect(pollResponses).to.eql([{ count: 1 }, { count: 2 }, { count: 3 }]);
      expect(nock.isDone()).to.be.true;
    });

    it("returns the response", async () => {
      const response = await pollInvocationStatus(operationName, () => null, /* backoff= */ 1);

      expect(response).to.eql({ foo: "12" });
      expect(nock.isDone()).to.be.true;
    });
  });
});
