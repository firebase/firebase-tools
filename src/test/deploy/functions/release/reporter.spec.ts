import { expect } from "chai";
import * as sinon from "sinon";

import { logger } from "../../../../logger";
import * as backend from "../../../../deploy/functions/backend";
import * as reporter from "../../../../deploy/functions/release/reporter";
import * as track from "../../../../track";
import * as events from "../../../../functions/events";
import * as args from "../../../../deploy/functions/args";

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
        }),
      ).to.equal("v1.https");
    });

    it("detects v2.https", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          httpsTrigger: {},
        }),
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
        }),
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
        }),
      ).to.equal("v2.callable");
    });

    it("detects v1.scheduled", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          scheduleTrigger: {},
        }),
      ).to.equal("v1.scheduled");
    });

    it("detects v2.scheduled", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          scheduleTrigger: {},
        }),
      ).to.equal("v2.scheduled");
    });

    it("detects v1.blocking", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          blockingTrigger: { eventType: events.v1.BEFORE_CREATE_EVENT },
        }),
      ).to.equal("v1.blocking");
    });

    it("detects v2.blocking", () => {
      expect(
        reporter.triggerTag({
          ...ENDPOINT_BASE,
          platform: "gcfv2",
          blockingTrigger: { eventType: events.v1.BEFORE_CREATE_EVENT },
        }),
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
        }),
      ).to.equal("google.pubsub.topic.publish");
    });
  });

  describe("logAndTrackDeployStats", () => {
    let trackGA4Stub: sinon.SinonStub;
    let debugStub: sinon.SinonStub;

    beforeEach(() => {
      trackGA4Stub = sinon.stub(track, "trackGA4");
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
            endpoint: { ...ENDPOINT, codebase: "codebase0" },
            durationMs: 2_000,
          },
          {
            endpoint: { ...ENDPOINT, codebase: "codebase1" },
            durationMs: 1_000,
            error: new reporter.DeploymentError(
              { ...ENDPOINT, codebase: "codebase1" },
              "update",
              undefined,
            ),
          },
          {
            endpoint: { ...ENDPOINT, codebase: "codebase1" },
            durationMs: 0,
            error: new reporter.AbortedDeploymentError({ ...ENDPOINT, codebase: "codebase1" }),
          },
        ],
      };

      const context: args.Context = {
        projectId: "id",
        codebaseDeployEvents: {
          codebase0: {
            params: "none",
            fn_deploy_num_successes: 0,
            fn_deploy_num_canceled: 0,
            fn_deploy_num_failures: 0,
            fn_deploy_num_skipped: 0,
          },
          codebase1: {
            params: "none",
            fn_deploy_num_successes: 0,
            fn_deploy_num_canceled: 0,
            fn_deploy_num_failures: 0,
            fn_deploy_num_skipped: 0,
          },
        },
      };

      await reporter.logAndTrackDeployStats(summary, context);

      expect(trackGA4Stub).to.have.been.calledWith("function_deploy", {
        platform: "gcfv1",
        trigger_type: "https",
        region: "region",
        runtime: "nodejs16",
        status: "success",
        duration: 2_000,
      });
      expect(trackGA4Stub).to.have.been.calledWith("function_deploy", {
        platform: "gcfv1",
        trigger_type: "https",
        region: "region",
        runtime: "nodejs16",
        status: "failure",
        duration: 1_000,
      });
      expect(trackGA4Stub).to.have.been.calledWith("function_deploy", {
        platform: "gcfv1",
        trigger_type: "https",
        region: "region",
        runtime: "nodejs16",
        status: "aborted",
        duration: 0,
      });

      expect(trackGA4Stub).to.have.been.calledWith("codebase_deploy", {
        params: "none",
        fn_deploy_num_successes: 1,
        fn_deploy_num_canceled: 0,
        fn_deploy_num_failures: 0,
        fn_deploy_num_skipped: 0,
      });
      expect(trackGA4Stub).to.have.been.calledWith("codebase_deploy", {
        params: "none",
        fn_deploy_num_successes: 0,
        fn_deploy_num_canceled: 1,
        fn_deploy_num_failures: 1,
        fn_deploy_num_skipped: 0,
      });

      expect(trackGA4Stub).to.have.been.calledWith("function_deploy_group", {
        codebase_deploy_count: "2",
        fn_deploy_num_successes: 1,
        fn_deploy_num_canceled: 1,
        fn_deploy_num_failures: 1,
      });

      // The 0ms for an aborted function isn't counted.
      expect(debugStub).to.have.been.calledWith("Average Function Deployment time: 1500");
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
        /Functions deploy had errors.*abortedDelete/s,
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
        "One or more functions were being implicitly made publicly available",
      );

      infoStub.resetHistory();
      // No longer explicitly setting invoker
      summary.results[0].endpoint = ENDPOINT;
      reporter.printErrors(summary);

      expect(infoStub).to.have.been.calledWithMatch("Unable to set the invoker for the IAM policy");
      expect(infoStub).to.have.been.calledWithMatch(
        "One or more functions were being implicitly made publicly available",
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
        "Exceeded maximum retries while deploying functions.",
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
        /the following functions were not deleted.*abortedDelete/s,
      );
      expect(infoStub).to.not.have.been.calledWith(
        /the following functions were not deleted.*failedCreate/s,
      );
    });
  });
});
