import { expect } from "chai";
import * as sinon from "sinon";

import { logger } from "../../../../logger";
import * as backend from "../../../../deploy/functions/backend";
import * as reporter from "../../../../deploy/functions/release/reporter";
import * as track from "../../../../track";
import * as events from "../../../../functions/events";

const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
  platform: "gcfv1",
  id: "id",
  region: "region",
  project: "project",
  entryPoint: "id",
  runtime: "nodejs16",
};
const ENDPOINT: backend.Endpoint = { ...ENDPOINT_BASE, httpsTrigger: {} };

describe("reporter", () => {
  describe("triggerTag", () => {
    it("detects v1.https", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          httpsTrigger: {},
        })
      ).to.equal("v1.https");
    });

    it("detects v2.https", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          httpsTrigger: {},
        })
      ).to.equal("v2.https");
    });

    it("detects v1.callable", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          httpsTrigger: {},
          labels: {
            "deployment-callable": "true",
          },
        })
      ).to.equal("v1.callable");
    });

    it("detects v2.callable", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          httpsTrigger: {},
          labels: {
            "deployment-callable": "true",
          },
        })
      ).to.equal("v2.callable");
    });

    it("detects v1.scheduled", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          scheduleTrigger: {},
        })
      ).to.equal("v1.scheduled");
    });

    it("detects v2.scheduled", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          scheduleTrigger: {},
        })
      ).to.equal("v2.scheduled");
    });

    it("detects v1.blocking", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          blockingTrigger: { eventType: events.v1.BEFORE_CREATE_EVENT },
        })
      ).to.equal("v1.blocking");
    });

    it("detects v2.blocking", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          blockingTrigger: { eventType: events.v1.BEFORE_CREATE_EVENT },
        })
      ).to.equal("v2.blocking");
    });

    it("detects others", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            eventFilters: {},
            retry: false,
          },
        })
      ).to.equal("google.pubsub.topic.publish");
    });
  });

  describe("logAndTrackDeployStats", () => {
    let trackStub: sinon.SinonStub;
    let debugStub: sinon.SinonStub;

    beforeEach(() => {
      trackStub = sinon.stub(track, "track");
      debugStub = sinon.stub(logger, "debug");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("tracks global summaries", async () => {
      const summary: reporter.Summary = {
        totalTime: 2_000,
        results: [
          {
            endpoint: ENDPOINT,
            durationMs: 2_000,
          },
          {
            endpoint: ENDPOINT,
            durationMs: 1_000,
            error: new reporter.DeploymentError(ENDPOINT, "update", undefined),
          },
          {
            endpoint: ENDPOINT,
            durationMs: 0,
            error: new reporter.AbortedDeploymentError(ENDPOINT),
          },
        ],
      };

      await reporter.logAndTrackDeployStats(summary);

      expect(trackStub).to.have.been.calledWith("functions_region_count", "1", 1);
      expect(trackStub).to.have.been.calledWith("function_deploy_success", "v1.https", 2_000);
      expect(trackStub).to.have.been.calledWith("function_deploy_failure", "v1.https", 1_000);
      // Aborts aren't tracked because they would throw off timing metrics
      expect(trackStub).to.not.have.been.calledWith("function_deploy_failure", "v1.https", 0);

      expect(debugStub).to.have.been.calledWith("Total Function Deployment time: 2000");
      expect(debugStub).to.have.been.calledWith("3 Functions Deployed");
      expect(debugStub).to.have.been.calledWith("1 Functions Errored");
      expect(debugStub).to.have.been.calledWith("1 Function Deployments Aborted");

      // The 0ms for an aborted function isn't counted.
      expect(debugStub).to.have.been.calledWith("Average Function Deployment time: 1500");
    });

    it("tracks v1 vs v2 codebases", async () => {
      const v1 = { ...ENDPOINT };
      const v2: backend.Endpoint = { ...ENDPOINT, platform: "gcfv2" };

      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: v1,
            durationMs: 1_000,
          },
          {
            endpoint: v2,
            durationMs: 1_000,
          },
        ],
      };

      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_codebase_deploy", "v1+v2", 2);
      trackStub.resetHistory();

      summary.results = [{ endpoint: v1, durationMs: 1_000 }];
      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_codebase_deploy", "v1", 1);
      trackStub.resetHistory();

      summary.results = [{ endpoint: v2, durationMs: 1_000 }];
      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_codebase_deploy", "v2", 1);
    });

    it("tracks overall success/failure", async () => {
      const success: reporter.DeployResult = {
        endpoint: ENDPOINT,
        durationMs: 1_000,
      };
      const failure: reporter.DeployResult = {
        endpoint: ENDPOINT,
        durationMs: 1_000,
        error: new reporter.DeploymentError(ENDPOINT, "create", undefined),
      };

      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [success, failure],
      };

      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_deploy_result", "partial_success", 1);
      expect(trackStub).to.have.been.calledWith("functions_deploy_result", "partial_failure", 1);
      expect(trackStub).to.have.been.calledWith(
        "functions_deploy_result",
        "partial_error_ratio",
        0.5
      );
      trackStub.resetHistory();

      summary.results = [success];
      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_deploy_result", "success", 1);
      trackStub.resetHistory();

      summary.results = [failure];
      await reporter.logAndTrackDeployStats(summary);
      expect(trackStub).to.have.been.calledWith("functions_deploy_result", "failure", 1);
    });
  });

  describe("printErrors", () => {
    let infoStub: sinon.SinonStub;

    beforeEach(() => {
      infoStub = sinon.stub(logger, "info");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("does nothing if there are no errors", () => {
      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: ENDPOINT,
            durationMs: 1_000,
          },
        ],
      };

      reporter.printErrors(summary);

      expect(infoStub).to.not.have.been.called;
    });

    it("only prints summaries for non-aborted errors", () => {
      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: { ...ENDPOINT, id: "failedCreate" },
            durationMs: 1_000,
            error: new reporter.DeploymentError(ENDPOINT, "create", undefined),
          },
          {
            endpoint: { ...ENDPOINT, id: "abortedDelete" },
            durationMs: 0,
            error: new reporter.AbortedDeploymentError(ENDPOINT),
          },
        ],
      };

      reporter.printErrors(summary);

      // N.B. The lists of functions are printed in one call along with their header
      // so that we know why a function label was printed (e.g. abortedDelete shouldn't
      // show up in the main list of functions that had deployment errors but should show
      // up in the list of functions that weren't deleted). To match these regexes we must
      // pass the "s" modifier to regexes to make . capture newlines.
      expect(infoStub).to.have.been.calledWithMatch(/Functions deploy had errors.*failedCreate/s);
      expect(infoStub).to.not.have.been.calledWithMatch(
        /Functions deploy had errors.*abortedDelete/s
      );
    });

    it("prints IAM errors", () => {
      const explicit: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {
          invoker: ["public"],
        },
      };

      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: explicit,
            durationMs: 1_000,
            error: new reporter.DeploymentError(explicit, "set invoker", undefined),
          },
        ],
      };

      reporter.printErrors(summary);

      expect(infoStub).to.have.been.calledWithMatch("Unable to set the invoker for the IAM policy");
      expect(infoStub).to.not.have.been.calledWithMatch(
        "One or more functions were being implicitly made publicly available"
      );

      infoStub.resetHistory();
      // No longer explicitly setting invoker
      summary.results[0].endpoint = ENDPOINT;
      reporter.printErrors(summary);

      expect(infoStub).to.have.been.calledWithMatch("Unable to set the invoker for the IAM policy");
      expect(infoStub).to.have.been.calledWithMatch(
        "One or more functions were being implicitly made publicly available"
      );
    });

    it("prints quota errors", () => {
      const rawError = new Error("Quota exceeded");
      (rawError as any).status = 429;
      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: ENDPOINT,
            durationMs: 1_000,
            error: new reporter.DeploymentError(ENDPOINT, "create", rawError),
          },
        ],
      };

      reporter.printErrors(summary);
      expect(infoStub).to.have.been.calledWithMatch(
        "Exceeded maximum retries while deploying functions."
      );
    });

    it("prints aborted errors", () => {
      const summary: reporter.Summary = {
        totalTime: 1_000,
        results: [
          {
            endpoint: { ...ENDPOINT, id: "failedCreate" },
            durationMs: 1_000,
            error: new reporter.DeploymentError(ENDPOINT, "create", undefined),
          },
          {
            endpoint: { ...ENDPOINT, id: "abortedDelete" },
            durationMs: 1_000,
            error: new reporter.AbortedDeploymentError(ENDPOINT),
          },
        ],
      };

      reporter.printErrors(summary);
      expect(infoStub).to.have.been.calledWithMatch(
        /the following functions were not deleted.*abortedDelete/s
      );
      expect(infoStub).to.not.have.been.calledWith(
        /the following functions were not deleted.*failedCreate/s
      );
    });
  });
});
