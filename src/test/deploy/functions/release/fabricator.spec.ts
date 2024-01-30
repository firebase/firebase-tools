import { expect } from "chai";
import * as sinon from "sinon";

import * as fabricator from "../../../../deploy/functions/release/fabricator";
import * as reporter from "../../../../deploy/functions/release/reporter";
import * as executor from "../../../../deploy/functions/release/executor";
import * as gcfNSV2 from "../../../../gcp/cloudfunctionsv2";
import * as gcfNS from "../../../../gcp/cloudfunctions";
import * as eventarcNS from "../../../../gcp/eventarc";
import * as pollerNS from "../../../../operation-poller";
import * as pubsubNS from "../../../../gcp/pubsub";
import * as schedulerNS from "../../../../gcp/cloudscheduler";
import * as runNS from "../../../../gcp/run";
import * as cloudtasksNS from "../../../../gcp/cloudtasks";
import * as backend from "../../../../deploy/functions/backend";
import * as scraper from "../../../../deploy/functions/release/sourceTokenScraper";
import * as planner from "../../../../deploy/functions/release/planner";
import * as v2events from "../../../../functions/events/v2";
import * as v1events from "../../../../functions/events/v1";
import * as servicesNS from "../../../../deploy/functions/services";
import * as identityPlatformNS from "../../../../gcp/identityPlatform";
import { AuthBlockingService } from "../../../../deploy/functions/services/auth";

describe("Fabricator", () => {
  // Stub all GCP APIs to make sure this test is hermetic
  let gcf: sinon.SinonStubbedInstance<typeof gcfNS>;
  let gcfv2: sinon.SinonStubbedInstance<typeof gcfNSV2>;
  let eventarc: sinon.SinonStubbedInstance<typeof eventarcNS>;
  let poller: sinon.SinonStubbedInstance<typeof pollerNS>;
  let pubsub: sinon.SinonStubbedInstance<typeof pubsubNS>;
  let scheduler: sinon.SinonStubbedInstance<typeof schedulerNS>;
  let run: sinon.SinonStubbedInstance<typeof runNS>;
  let tasks: sinon.SinonStubbedInstance<typeof cloudtasksNS>;
  let services: sinon.SinonStubbedInstance<typeof servicesNS>;
  let identityPlatform: sinon.SinonStubbedInstance<typeof identityPlatformNS>;

  beforeEach(() => {
    gcf = sinon.stub(gcfNS);
    gcfv2 = sinon.stub(gcfNSV2);
    eventarc = sinon.stub(eventarcNS);
    poller = sinon.stub(pollerNS);
    pubsub = sinon.stub(pubsubNS);
    scheduler = sinon.stub(schedulerNS);
    run = sinon.stub(runNS);
    tasks = sinon.stub(cloudtasksNS);
    services = sinon.stub(servicesNS);
    identityPlatform = sinon.stub(identityPlatformNS);

    gcf.functionFromEndpoint.restore();
    gcfv2.functionFromEndpoint.restore();
    scheduler.jobFromEndpoint.restore();
    tasks.queueFromEndpoint.restore();
    tasks.queueNameForEndpoint.restore();
    gcf.createFunction.rejects(new Error("unexpected gcf.createFunction"));
    gcf.updateFunction.rejects(new Error("unexpected gcf.updateFunction"));
    gcf.deleteFunction.rejects(new Error("unexpected gcf.deleteFunction"));
    gcf.getIamPolicy.rejects(new Error("unexpected gcf.getIamPolicy"));
    gcf.setIamPolicy.rejects(new Error("unexpected gcf.setIamPolicy"));
    gcf.setInvokerCreate.rejects(new Error("unexpected gcf.setInvokerCreate"));
    gcf.setInvokerUpdate.rejects(new Error("unexpected gcf.setInvokerUpdate"));
    gcfv2.createFunction.rejects(new Error("unexpected gcfv2.createFunction"));
    gcfv2.updateFunction.rejects(new Error("unexpected gcfv2.updateFunction"));
    gcfv2.deleteFunction.rejects(new Error("unexpected gcfv2.deleteFunction"));
    eventarc.getChannel.rejects(new Error("unexpected eventarc.getChannel"));
    eventarc.createChannel.rejects(new Error("unexpected eventarc.createChannel"));
    eventarc.deleteChannel.rejects(new Error("unexpected eventarc.deleteChannel"));
    eventarc.getChannel.rejects(new Error("unexpected eventarc.getChannel"));
    eventarc.updateChannel.rejects(new Error("unexpected eventarc.updateChannel"));
    run.getIamPolicy.rejects(new Error("unexpected run.getIamPolicy"));
    run.setIamPolicy.rejects(new Error("unexpected run.setIamPolicy"));
    run.setInvokerCreate.rejects(new Error("unexpected run.setInvokerCreate"));
    run.setInvokerUpdate.rejects(new Error("unexpected run.setInvokerUpdate"));
    run.replaceService.rejects(new Error("unexpected run.replaceService"));
    run.updateService.rejects(new Error("Unexpected run.updateService"));
    poller.pollOperation.rejects(new Error("unexpected poller.pollOperation"));
    pubsub.createTopic.rejects(new Error("unexpected pubsub.createTopic"));
    pubsub.deleteTopic.rejects(new Error("unexpected pubsub.deleteTopic"));
    scheduler.createOrReplaceJob.rejects(new Error("unexpected scheduler.createOrReplaceJob"));
    scheduler.deleteJob.rejects(new Error("unexpected scheduler.deleteJob"));
    tasks.upsertQueue.rejects(new Error("unexpected tasks.upsertQueue"));
    tasks.createQueue.rejects(new Error("unexpected tasks.createQueue"));
    tasks.updateQueue.rejects(new Error("unexpected tasks.updateQueue"));
    tasks.deleteQueue.rejects(new Error("unexpected tasks.deleteQueue"));
    tasks.setEnqueuer.rejects(new Error("unexpected tasks.setEnqueuer"));
    tasks.setIamPolicy.rejects(new Error("unexpected tasks.setIamPolicy"));
    tasks.getIamPolicy.rejects(new Error("unexpected tasks.getIamPolicy"));
    services.serviceForEndpoint.throws("unexpected services.serviceForEndpoint");
    identityPlatform.getBlockingFunctionsConfig.rejects(
      new Error("unexpected identityPlatform.getBlockingFunctionsConfig"),
    );
    identityPlatform.setBlockingFunctionsConfig.rejects(
      new Error("unexpected identityPlatform.setBlockingFunctionsConfig"),
    );
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  const storage: gcfNSV2.StorageSource = {
    bucket: "bucket",
    object: "object",
    generation: 42,
  };
  const ctorArgs: fabricator.FabricatorArgs = {
    executor: new executor.InlineExecutor(),
    functionExecutor: new executor.InlineExecutor(),
    sources: {
      default: {
        sourceUrl: "https://example.com",
        storage: storage,
      },
    },
    appEngineLocation: "us-central1",
    projectNumber: "1234567",
  };
  let fab: fabricator.Fabricator;
  beforeEach(() => {
    fab = new fabricator.Fabricator(ctorArgs);
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  function endpoint(
    trigger: backend.Triggered = { httpsTrigger: {} },
    base: Partial<backend.Endpoint> = {},
  ): backend.Endpoint {
    return {
      platform: "gcfv1",
      id: "id",
      region: "us-central1",
      entryPoint: "entrypoint",
      runtime: "nodejs16",
      availableMemoryMb: 256,
      cpu: backend.memoryToGen1Cpu(256),
      codebase: "default",
      ...JSON.parse(JSON.stringify(base)),
      ...trigger,
    } as backend.Endpoint;
  }

  describe("createV1Function", () => {
    it("throws on create function failure", async () => {
      gcf.createFunction.rejects(new Error("Server failure"));

      await expect(
        fab.createV1Function(endpoint(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "create");

      gcf.createFunction.resolves({ name: "op", type: "create", done: false });
      poller.pollOperation.rejects(new Error("Fail whale"));
      await expect(
        fab.createV1Function(endpoint(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "create");
    });

    it("throws on set invoker failure", async () => {
      gcf.createFunction.resolves({ name: "op", type: "create", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerCreate.rejects(new Error("Boom"));

      await expect(
        fab.createV1Function(endpoint(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "set invoker");
    });

    describe("httpsTrigger", () => {
      it("enforces SECURE_ALWAYS HTTPS policies", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint();

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.createFunction).to.have.been.calledWithMatch({
          httpsTrigger: {
            securityLevel: "SECURE_ALWAYS",
          },
        });
      });

      it("sets public invoker by default", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint();

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.have.been.calledWith(ep.project, backend.functionName(ep), [
          "public",
        ]);
      });

      it("sets explicit invoker", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({
          httpsTrigger: {
            invoker: ["custom@"],
          },
        });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.have.been.calledWith(ep.project, backend.functionName(ep), [
          "custom@",
        ]);
      });

      it("doesn't set private invoker on create", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({
          httpsTrigger: {
            invoker: ["private"],
          },
        });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.not.have.been.called;
      });
    });

    describe("callableTrigger", () => {
      it("enforces SECURE_ALWAYS HTTPS policies", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({ callableTrigger: {} });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.createFunction).to.have.been.calledWithMatch({
          httpsTrigger: {
            securityLevel: "SECURE_ALWAYS",
          },
        });
      });

      it("always sets invoker to public", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({ callableTrigger: {} });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.have.been.calledWith(ep.project, backend.functionName(ep), [
          "public",
        ]);
      });
    });

    describe("taskQueueTrigger", () => {
      it("enforces SECURE_ALWAYS HTTPS policies", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({ taskQueueTrigger: {} });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.createFunction).to.have.been.calledWithMatch({
          httpsTrigger: {
            securityLevel: "SECURE_ALWAYS",
          },
        });
      });

      it("doesn't set invoker by default", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({ taskQueueTrigger: {} });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.not.have.been.called;
      });

      it("sets explicit invoker", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({
          httpsTrigger: {
            invoker: ["custom@"],
          },
        });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());
        expect(gcf.setInvokerCreate).to.have.been.calledWith(ep.project, backend.functionName(ep), [
          "custom@",
        ]);
      });
    });

    describe("blockingTrigger", () => {
      it("sets the invoker to public", async () => {
        gcf.createFunction.resolves({ name: "op", type: "create", done: false });
        poller.pollOperation.resolves();
        gcf.setInvokerCreate.resolves();
        const ep = endpoint({ blockingTrigger: { eventType: v1events.BEFORE_CREATE_EVENT } });

        await fab.createV1Function(ep, new scraper.SourceTokenScraper());

        expect(gcf.setInvokerCreate).to.have.been.calledWith(ep.project, backend.functionName(ep), [
          "public",
        ]);
      });
    });

    it("doesn't set invoker on non-http functions", async () => {
      gcf.createFunction.resolves({ name: "op", type: "create", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerCreate.resolves();
      const ep0 = endpoint({
        scheduleTrigger: {},
      });
      const ep1 = endpoint({
        eventTrigger: {
          eventType: "some.event",
          eventFilters: { resource: "some-resource" },
          retry: false,
        },
      });

      await fab.createV1Function(ep0, new scraper.SourceTokenScraper());
      await fab.createV1Function(ep1, new scraper.SourceTokenScraper());
      expect(gcf.setInvokerCreate).to.not.have.been.called;
    });
  });

  describe("updateV1Function", () => {
    it("throws on update function failure", async () => {
      gcf.updateFunction.rejects(new Error("Server failure"));

      await expect(
        fab.updateV1Function(endpoint(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "update");

      gcf.updateFunction.resolves({ name: "op", type: "update", done: false });
      poller.pollOperation.rejects(new Error("Fail whale"));
      await expect(
        fab.updateV1Function(endpoint(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "update");
    });

    it("throws on set invoker failure", async () => {
      gcf.updateFunction.resolves({ name: "op", type: "update", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerUpdate.rejects(new Error("Boom"));

      const ep = endpoint({
        httpsTrigger: {
          invoker: ["private"],
        },
      });
      await expect(fab.updateV1Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "set invoker",
      );
    });

    it("sets explicit invoker", async () => {
      gcf.updateFunction.resolves({ name: "op", type: "create", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerUpdate.resolves();
      const ep0 = endpoint({
        httpsTrigger: {
          invoker: ["custom@"],
        },
      });
      const ep1 = endpoint({
        taskQueueTrigger: {
          invoker: ["custom@"],
        },
      });
      const ep2 = endpoint({
        blockingTrigger: {
          eventType: v1events.BEFORE_CREATE_EVENT,
        },
      });

      await fab.updateV1Function(ep0, new scraper.SourceTokenScraper());
      await fab.updateV1Function(ep1, new scraper.SourceTokenScraper());
      await fab.updateV1Function(ep2, new scraper.SourceTokenScraper());
      expect(gcf.setInvokerUpdate).to.have.been.calledWith(ep0.project, backend.functionName(ep0), [
        "custom@",
      ]);
      expect(gcf.setInvokerUpdate).to.have.been.calledWith(ep1.project, backend.functionName(ep1), [
        "custom@",
      ]);
      expect(gcf.setInvokerUpdate).to.have.been.calledWith(ep2.project, backend.functionName(ep2), [
        "public",
      ]);
    });

    it("does not set invoker by default", async () => {
      gcf.updateFunction.resolves({ name: "op", type: "update", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerUpdate.resolves();
      const ep = endpoint();

      await fab.updateV1Function(ep, new scraper.SourceTokenScraper());
      expect(gcf.setInvokerUpdate).to.not.have.been.called;
    });

    it("doesn't set invoker on non-http functions", async () => {
      gcf.updateFunction.resolves({ name: "op", type: "update", done: false });
      poller.pollOperation.resolves();
      gcf.setInvokerUpdate.resolves();
      const ep = endpoint({
        scheduleTrigger: {},
      });

      await fab.updateV1Function(ep, new scraper.SourceTokenScraper());
      expect(gcf.setInvokerUpdate).to.not.have.been.called;
    });
  });

  describe("deleteV1Function", () => {
    it("throws on delete function failure", async () => {
      gcf.deleteFunction.rejects(new Error("404"));
      const ep = endpoint();

      await expect(fab.deleteV1Function(ep)).to.be.rejectedWith(reporter.DeploymentError, "delete");

      gcf.deleteFunction.resolves({ name: "op", type: "delete", done: false });
      poller.pollOperation.rejects(new Error("5xx"));

      await expect(fab.deleteV1Function(ep)).to.be.rejectedWith(reporter.DeploymentError, "delete");
    });
  });

  describe("createV2Function", () => {
    it("handles topics that already exist", async () => {
      pubsub.createTopic.callsFake(() => {
        const err = new Error("Already exists");
        (err as any).status = 409;
        return Promise.reject(err);
      });
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: v2events.PUBSUB_PUBLISH_EVENT,
            eventFilters: { topic: "topic" },
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await fab.createV2Function(ep, new scraper.SourceTokenScraper());
      expect(pubsub.createTopic).to.have.been.called;
      expect(gcfv2.createFunction).to.have.been.called;
    });

    it("handles failures to create a topic", async () => {
      pubsub.createTopic.rejects(new Error("🤷‍♂️"));

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: v2events.PUBSUB_PUBLISH_EVENT,
            eventFilters: { topic: "topic" },
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await expect(fab.createV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "create topic",
      );
    });

    it("handles already existing eventarc channels", async () => {
      eventarc.getChannel.resolves({ name: "channel" });
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: "custom.test.event",
            channel: "channel",
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await fab.createV2Function(ep, new scraper.SourceTokenScraper());
      expect(eventarc.getChannel).to.have.been.called;
      expect(eventarc.createChannel).to.not.have.been.called;
      expect(gcfv2.createFunction).to.have.been.called;
    });

    it("handles already existing eventarc channels (createChannel return 409)", async () => {
      eventarc.getChannel.resolves(undefined);
      eventarc.createChannel.callsFake(({ name }) => {
        expect(name).to.equal("channel");
        const err = new Error("Already exists");
        (err as any).status = 409;
        return Promise.reject(err);
      });
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: "custom.test.event",
            channel: "channel",
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await fab.createV2Function(ep, new scraper.SourceTokenScraper());
      expect(eventarc.createChannel).to.have.been.called;
      expect(gcfv2.createFunction).to.have.been.called;
    });

    it("creates channels if necessary", async () => {
      const channelName = "channel";
      eventarc.getChannel.resolves(undefined);
      eventarc.createChannel.callsFake(({ name }) => {
        expect(name).to.equal(channelName);
        return Promise.resolve({
          name: "op-resource-name",
          metadata: {
            createTime: "",
            target: "",
            verb: "",
            requestedCancellation: false,
            apiVersion: "",
          },
          done: false,
        });
      });
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: "custom.test.event",
            channel: channelName,
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await fab.createV2Function(ep, new scraper.SourceTokenScraper());
      expect(eventarc.createChannel).to.have.been.calledOnceWith({ name: channelName });
      expect(poller.pollOperation).to.have.been.called;
    });

    it("wraps errors thrown while creating channels", async () => {
      eventarc.getChannel.resolves(undefined);
      eventarc.createChannel.callsFake(() => {
        const err = new Error("🤷‍♂️");
        (err as any).status = 400;
        return Promise.reject(err);
      });

      const ep = endpoint(
        {
          eventTrigger: {
            eventType: "custom.test.event",
            channel: "channel",
            retry: false,
          },
        },
        {
          platform: "gcfv2",
        },
      );

      await expect(
        fab.createV2Function(ep, new scraper.SourceTokenScraper()),
      ).to.eventually.be.rejectedWith(reporter.DeploymentError, "upsert eventarc channel");
    });

    it("throws on create function failure", async () => {
      gcfv2.createFunction.rejects(new Error("Server failure"));

      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      await expect(fab.createV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "create",
      );

      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.rejects(new Error("Fail whale"));

      await expect(fab.createV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "create",
      );
    });

    it("tries to grab new token on abort", async () => {
      const sc = new scraper.SourceTokenScraper();
      sc.poller({
        metadata: {
          sourceToken: "magic token",
          target: "projects/p/locations/l/functions/f",
        },
      });

      gcfv2.createFunction.onFirstCall().rejects({ message: "unknown" });
      gcfv2.createFunction.resolves({ name: "op", done: true });

      const ep1 = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const ep2 = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const fn1 = fab.createV2Function(ep1, sc);
      const fn2 = fab.createV2Function(ep2, sc);
      try {
        await Promise.all([fn1, fn2]);
      } catch (err) {
        // do nothing, error is expected
      }
      await expect(sc.getToken()).to.eventually.equal("magic token");
    });

    it("deletes broken function and retries on cloud run quota exhaustion", async () => {
      gcfv2.createFunction.onFirstCall().rejects({ message: "Cloud Run quota exhausted", code: 8 });
      gcfv2.createFunction.resolves({ name: "op", done: false });

      gcfv2.deleteFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ name: "op" });

      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      await fab.createV2Function(ep, new scraper.SourceTokenScraper());

      expect(gcfv2.createFunction).to.have.been.calledTwice;
      expect(gcfv2.deleteFunction).to.have.been.called;
    });

    it("throws on set invoker failure", async () => {
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerCreate.rejects(new Error("Boom"));

      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      await expect(fab.createV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "set invoker",
      );
    });

    describe("httpsTrigger", () => {
      it("sets invoker to public by default", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.have.been.calledWith(ep.project, "service", ["public"]);
      });

      it("sets explicit invoker", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint(
          {
            httpsTrigger: {
              invoker: ["custom@"],
            },
          },
          { platform: "gcfv2" },
        );

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.have.been.calledWith(ep.project, "service", ["custom@"]);
      });

      it("doesn't set private invoker on create", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint({ httpsTrigger: { invoker: ["private"] } }, { platform: "gcfv2" });

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.not.have.been.called;
      });
    });

    describe("callableTrigger", () => {
      it("always sets invoker to public", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint({ callableTrigger: {} }, { platform: "gcfv2" });

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.have.been.calledWith(ep.project, "service", ["public"]);
      });
    });

    describe("taskQueueTrigger", () => {
      it("doesn't set invoker by default", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint({ taskQueueTrigger: {} }, { platform: "gcfv2" });

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.not.have.been.called;
      });

      it("sets explicit invoker", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint(
          {
            taskQueueTrigger: {
              invoker: ["custom@"],
            },
          },
          { platform: "gcfv2" },
        );
        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.have.been.calledWith(ep.project, "service", ["custom@"]);
      });
    });

    describe("blockingTrigger", () => {
      it("always sets invoker to public", async () => {
        gcfv2.createFunction.resolves({ name: "op", done: false });
        poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
        run.setInvokerCreate.resolves();
        const ep = endpoint(
          { blockingTrigger: { eventType: v1events.BEFORE_CREATE_EVENT } },
          { platform: "gcfv2" },
        );

        await fab.createV2Function(ep, new scraper.SourceTokenScraper());
        expect(run.setInvokerCreate).to.have.been.calledWith(ep.project, "service", ["public"]);
      });
    });

    it("doesn't set invoker on non-http functions", async () => {
      gcfv2.createFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerCreate.resolves();
      const ep = endpoint(
        { eventTrigger: { eventType: "event", eventFilters: {}, retry: false } },
        { platform: "gcfv2" },
      );

      await fab.createV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerCreate).to.not.have.been.called;
    });
  });

  describe("updateV2Function", () => {
    it("throws on update function failure", async () => {
      gcfv2.updateFunction.rejects(new Error("Server failure"));

      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      await expect(fab.updateV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "update",
      );

      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.rejects(new Error("Fail whale"));
      await expect(fab.updateV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "update",
      );
    });

    it("throws on set invoker failure", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.rejects(new Error("Boom"));

      const ep = endpoint({ httpsTrigger: { invoker: ["private"] } }, { platform: "gcfv2" });
      await expect(fab.updateV2Function(ep, new scraper.SourceTokenScraper())).to.be.rejectedWith(
        reporter.DeploymentError,
        "set invoker",
      );
    });

    it("sets explicit invoker on httpsTrigger", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.resolves();
      const ep = endpoint(
        {
          httpsTrigger: {
            invoker: ["custom@"],
          },
        },
        { platform: "gcfv2" },
      );

      await fab.updateV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerUpdate).to.have.been.calledWith(ep.project, "service", ["custom@"]);
    });

    it("sets explicit invoker on taskQueueTrigger", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.resolves();
      const ep = endpoint(
        {
          taskQueueTrigger: {
            invoker: ["custom@"],
          },
        },
        { platform: "gcfv2" },
      );

      await fab.updateV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerUpdate).to.have.been.calledWith(ep.project, "service", ["custom@"]);
    });

    it("sets explicit invoker on blockingTrigger", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.resolves();
      const ep = endpoint(
        {
          blockingTrigger: {
            eventType: v1events.BEFORE_CREATE_EVENT,
          },
        },
        { platform: "gcfv2" },
      );

      await fab.updateV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerUpdate).to.have.been.calledWith(ep.project, "service", ["public"]);
    });

    it("does not set invoker by default", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.resolves();
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });

      await fab.updateV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerUpdate).to.not.have.been.called;
    });

    it("doesn't set invoker on non-http functions", async () => {
      gcfv2.updateFunction.resolves({ name: "op", done: false });
      poller.pollOperation.resolves({ serviceConfig: { service: "service" } });
      run.setInvokerUpdate.resolves();
      const ep = endpoint(
        { eventTrigger: { eventType: "event", eventFilters: {}, retry: false } },
        { platform: "gcfv2" },
      );

      await fab.updateV2Function(ep, new scraper.SourceTokenScraper());
      expect(run.setInvokerUpdate).to.not.have.been.called;
    });

    it("tries to grab new token on abort", async () => {
      const sc = new scraper.SourceTokenScraper();
      sc.poller({
        metadata: {
          sourceToken: "magic token",
          target: "projects/p/locations/l/functions/f",
        },
      });

      gcfv2.updateFunction.onFirstCall().rejects({ message: "unknown" });
      gcfv2.updateFunction.resolves({ name: "op", done: true });

      const ep1 = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const ep2 = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const fn1 = fab.updateV2Function(ep1, sc);
      const fn2 = fab.updateV2Function(ep2, sc);
      try {
        await Promise.all([fn1, fn2]);
      } catch (err) {
        // do nothing, error is expected
      }
      await expect(sc.getToken()).to.eventually.equal("magic token");
    });
  });

  describe("deleteV2Function", () => {
    it("throws on delete function failure", async () => {
      gcfv2.deleteFunction.rejects(new Error("404"));
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });

      await expect(fab.deleteV2Function(ep)).to.be.rejectedWith(reporter.DeploymentError, "delete");

      gcfv2.deleteFunction.resolves({ name: "op", done: false });
      poller.pollOperation.rejects(new Error("5xx"));

      await expect(fab.deleteV2Function(ep)).to.be.rejectedWith(reporter.DeploymentError, "delete");
    });
  });

  describe("upsertScheduleV1", () => {
    const ep = endpoint({
      scheduleTrigger: {
        schedule: "every 5 minutes",
      },
    }) as backend.Endpoint & backend.ScheduleTriggered;

    it("upserts schedules", async () => {
      scheduler.createOrReplaceJob.resolves();
      await fab.upsertScheduleV1(ep);
      expect(scheduler.createOrReplaceJob).to.have.been.called;
    });

    it("wraps errors", async () => {
      scheduler.createOrReplaceJob.rejects(new Error("Fail"));
      await expect(fab.upsertScheduleV1(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "upsert schedule",
      );
    });
  });

  describe("upsertScheduleV2", () => {
    const ep = {
      ...endpoint({
        scheduleTrigger: {
          schedule: "every 5 minutes",
        },
      }),
      platform: "gcfv2",
    } as backend.Endpoint & backend.ScheduleTriggered;

    it("upserts schedules", async () => {
      scheduler.createOrReplaceJob.resolves();
      await fab.upsertScheduleV2(ep);
      expect(scheduler.createOrReplaceJob).to.have.been.called;
    });

    it("wraps errors", async () => {
      scheduler.createOrReplaceJob.rejects(new Error("Fail"));
      await expect(fab.upsertScheduleV2(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "upsert schedule",
      );
    });
  });

  describe("deleteScheduleV1", () => {
    const ep = endpoint({
      scheduleTrigger: {
        schedule: "every 5 minutes",
      },
    }) as backend.Endpoint & backend.ScheduleTriggered;

    it("deletes schedules and topics", async () => {
      scheduler.deleteJob.resolves();
      pubsub.deleteTopic.resolves();
      await fab.deleteScheduleV1(ep);
      expect(scheduler.deleteJob).to.have.been.called;
      expect(pubsub.deleteTopic).to.have.been.called;
    });

    it("wraps errors", async () => {
      scheduler.deleteJob.rejects(new Error("Fail"));
      await expect(fab.deleteScheduleV1(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "delete schedule",
      );

      scheduler.deleteJob.resolves();
      pubsub.deleteTopic.rejects(new Error("Fail"));
      await expect(fab.deleteScheduleV1(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "delete topic",
      );
    });
  });

  describe("deleteScheduleV2", () => {
    const ep = {
      ...endpoint({
        scheduleTrigger: {
          schedule: "every 5 minutes",
        },
      }),
      platform: "gcfv2",
    } as backend.Endpoint & backend.ScheduleTriggered;

    it("deletes schedules and topics", async () => {
      scheduler.deleteJob.resolves();
      await fab.deleteScheduleV2(ep);
      expect(scheduler.deleteJob).to.have.been.called;
    });

    it("wraps errors", async () => {
      scheduler.deleteJob.rejects(new Error("Fail"));
      await expect(fab.deleteScheduleV2(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "delete schedule",
      );
    });
  });

  describe("upsertTaskQueue", () => {
    it("upserts task queues", async () => {
      const ep = endpoint({
        taskQueueTrigger: {},
      }) as backend.Endpoint & backend.TaskQueueTriggered;
      tasks.upsertQueue.resolves();
      await fab.upsertTaskQueue(ep);
      expect(tasks.upsertQueue).to.have.been.called;
      expect(tasks.setEnqueuer).to.not.have.been.called;
    });

    it("sets enqueuer", async () => {
      const ep = endpoint({
        taskQueueTrigger: {
          invoker: ["public"],
        },
      }) as backend.Endpoint & backend.TaskQueueTriggered;
      tasks.upsertQueue.resolves();
      tasks.setEnqueuer.resolves();
      await fab.upsertTaskQueue(ep);
      expect(tasks.upsertQueue).to.have.been.called;
      expect(tasks.setEnqueuer).to.have.been.calledWithMatch(tasks.queueNameForEndpoint(ep), [
        "public",
      ]);
    });

    it("wraps errors", async () => {
      const ep = endpoint({
        taskQueueTrigger: {
          invoker: ["public"],
        },
      }) as backend.Endpoint & backend.TaskQueueTriggered;
      tasks.upsertQueue.rejects(new Error("oh no"));
      await expect(fab.upsertTaskQueue(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "upsert task queue",
      );

      tasks.upsertQueue.resolves();
      tasks.setEnqueuer.rejects(new Error("nope"));
      await expect(fab.upsertTaskQueue(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "set invoker",
      );
    });
  });

  describe("disableTaskQueue", () => {
    it("disables task queues", async () => {
      const ep = endpoint({
        taskQueueTrigger: {},
      }) as backend.Endpoint & backend.TaskQueueTriggered;
      tasks.updateQueue.resolves();
      await fab.disableTaskQueue(ep);
      expect(tasks.updateQueue).to.have.been.calledWith({
        name: tasks.queueNameForEndpoint(ep),
        state: "DISABLED",
      });
    });

    it("wraps errors", async () => {
      const ep = endpoint({
        taskQueueTrigger: {},
      }) as backend.Endpoint & backend.TaskQueueTriggered;
      tasks.updateQueue.rejects(new Error("Not today"));
      await expect(fab.disableTaskQueue(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "disable task queue",
      );
    });
  });

  describe("registerBlockingTrigger", () => {
    const ep = endpoint(
      {
        blockingTrigger: {
          eventType: v1events.BEFORE_CREATE_EVENT,
        },
      },
      { uri: "myuri.net" },
    ) as backend.Endpoint & backend.BlockingTriggered;
    const authBlockingService = new AuthBlockingService();

    it("registers auth blocking trigger", async () => {
      services.serviceForEndpoint.returns(authBlockingService);
      identityPlatform.getBlockingFunctionsConfig.resolves({});
      identityPlatform.setBlockingFunctionsConfig.resolves({});
      await fab.registerBlockingTrigger(ep);
      expect(identityPlatform.getBlockingFunctionsConfig).to.have.been.called;
      expect(identityPlatform.setBlockingFunctionsConfig).to.have.been.called;
    });

    it("wraps errors", async () => {
      services.serviceForEndpoint.returns(authBlockingService);
      identityPlatform.getBlockingFunctionsConfig.rejects(new Error("Fail"));
      await expect(fab.registerBlockingTrigger(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "register blocking trigger",
      );
    });
  });

  describe("unregisterBlockingTrigger", () => {
    const ep = endpoint(
      {
        blockingTrigger: {
          eventType: v1events.BEFORE_CREATE_EVENT,
        },
      },
      { uri: "myuri.net" },
    ) as backend.Endpoint & backend.BlockingTriggered;
    const authBlockingService = new AuthBlockingService();

    it("unregisters auth blocking trigger", async () => {
      services.serviceForEndpoint.returns(authBlockingService);
      identityPlatform.getBlockingFunctionsConfig.resolves({
        triggers: { beforeCreate: { functionUri: "myuri.net" } },
      });
      identityPlatform.setBlockingFunctionsConfig.resolves({});
      await fab.unregisterBlockingTrigger(ep);
      expect(identityPlatform.getBlockingFunctionsConfig).to.have.been.called;
      expect(identityPlatform.setBlockingFunctionsConfig).to.have.been.called;
    });

    it("wraps errors", async () => {
      services.serviceForEndpoint.returns(authBlockingService);
      identityPlatform.getBlockingFunctionsConfig.rejects(new Error("Fail"));
      await expect(fab.unregisterBlockingTrigger(ep)).to.eventually.be.rejectedWith(
        reporter.DeploymentError,
        "unregister blocking trigger",
      );
    });
  });

  describe("setTrigger", () => {
    it("does nothing for HTTPS functions", async () => {
      // all APIs throw by default
      await fab.setTrigger(endpoint({ httpsTrigger: {} }));
    });

    it("does nothing for event triggers without channels", async () => {
      // all APIs throw by default
      const ep = endpoint({
        eventTrigger: {
          eventType: v2events.PUBSUB_PUBLISH_EVENT,
          eventFilters: { topic: "topic" },
          retry: false,
        },
      });
      await fab.setTrigger(ep);
    });

    it("sets schedule triggers", async () => {
      const ep = endpoint({
        scheduleTrigger: {
          schedule: "every 5 minutes",
        },
      });
      const upsertScheduleV1 = sinon.stub(fab, "upsertScheduleV1");
      upsertScheduleV1.resolves();

      await fab.setTrigger(ep);
      expect(upsertScheduleV1).to.have.been.called;
      upsertScheduleV1.restore();

      ep.platform = "gcfv2";
      const upsertScheduleV2 = sinon.stub(fab, "upsertScheduleV2");
      upsertScheduleV2.resolves();

      await fab.setTrigger(ep);
      expect(upsertScheduleV2).to.have.been.called;
    });

    it("sets task queue triggers", async () => {
      const ep = endpoint({
        taskQueueTrigger: {},
      });
      const upsertTaskQueue = sinon.stub(fab, "upsertTaskQueue");
      upsertTaskQueue.resolves();

      await fab.setTrigger(ep);
      expect(upsertTaskQueue).to.have.been.called;
    });
  });

  describe("deleteTrigger", () => {
    it("does nothing for HTTPS functions", async () => {
      // all APIs throw by default
      await fab.deleteTrigger(endpoint({ httpsTrigger: {} }));
    });

    it("does nothing for event triggers", async () => {
      // all APIs throw by default
      const ep = endpoint({
        eventTrigger: {
          eventType: v2events.PUBSUB_PUBLISH_EVENT,
          eventFilters: { topic: "topic" },
          retry: false,
        },
      });
      await fab.deleteTrigger(ep);
    });

    it("deletes schedule triggers", async () => {
      const ep = endpoint({
        scheduleTrigger: {
          schedule: "every 5 minutes",
        },
      });
      const deleteScheduleV1 = sinon.stub(fab, "deleteScheduleV1");
      deleteScheduleV1.resolves();

      await fab.deleteTrigger(ep);
      expect(deleteScheduleV1).to.have.been.called;
      deleteScheduleV1.restore();

      ep.platform = "gcfv2";
      const deleteScheduleV2 = sinon.stub(fab, "deleteScheduleV2");
      deleteScheduleV2.resolves();

      await fab.deleteTrigger(ep);
      expect(deleteScheduleV2).to.have.been.called;
    });

    it("deletes task queue triggers", async () => {
      const ep = endpoint({
        taskQueueTrigger: {},
      });
      const disableTaskQueue = sinon.stub(fab, "disableTaskQueue");

      await fab.deleteTrigger(ep);
      expect(disableTaskQueue).to.have.been.called;
    });
  });

  describe("createEndpoint", () => {
    it("creates v1 functions", async () => {
      const ep = endpoint();
      const setTrigger = sinon.stub(fab, "setTrigger");
      setTrigger.resolves();
      const createV1Function = sinon.stub(fab, "createV1Function");
      createV1Function.resolves();

      await fab.createEndpoint(
        ep,
        new scraper.SourceTokenScraper(),
        new scraper.SourceTokenScraper(),
      );
      expect(createV1Function).is.calledOnce;
      expect(setTrigger).is.calledOnce;
      expect(setTrigger).is.calledAfter(createV1Function);
    });

    it("creates v2 functions", async () => {
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const setTrigger = sinon.stub(fab, "setTrigger");
      setTrigger.resolves();
      const createV2Function = sinon.stub(fab, "createV2Function");
      createV2Function.resolves();

      await fab.createEndpoint(
        ep,
        new scraper.SourceTokenScraper(),
        new scraper.SourceTokenScraper(),
      );
      expect(createV2Function).is.calledOnce;
      expect(setTrigger).is.calledOnce;
      expect(setTrigger).is.calledAfter(createV2Function);
    });

    it("aborts for failures midway", async () => {
      const ep = endpoint();
      const setTrigger = sinon.stub(fab, "setTrigger");
      const createV1Function = sinon.stub(fab, "createV1Function");
      createV1Function.rejects(new reporter.DeploymentError(ep, "set invoker", undefined));

      await expect(
        fab.createEndpoint(ep, new scraper.SourceTokenScraper(), new scraper.SourceTokenScraper()),
      ).to.be.rejectedWith(reporter.DeploymentError, "set invoker");
      expect(createV1Function).is.calledOnce;
      expect(setTrigger).is.not.called;
    });
  });

  describe("updateEndpoint", () => {
    it("updates v1 functions", async () => {
      const ep = endpoint();
      const setTrigger = sinon.stub(fab, "setTrigger");
      setTrigger.resolves();
      const updateV1Function = sinon.stub(fab, "updateV1Function");
      updateV1Function.resolves();

      await fab.updateEndpoint(
        { endpoint: ep },
        new scraper.SourceTokenScraper(),
        new scraper.SourceTokenScraper(),
      );
      expect(updateV1Function).is.calledOnce;
      expect(setTrigger).is.calledOnce;
      expect(setTrigger).is.calledAfter(updateV1Function);
    });

    it("updates v2 functions", async () => {
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const setTrigger = sinon.stub(fab, "setTrigger");
      setTrigger.resolves();
      const updateV2Function = sinon.stub(fab, "updateV2Function");
      updateV2Function.resolves();

      await fab.updateEndpoint(
        { endpoint: ep },
        new scraper.SourceTokenScraper(),
        new scraper.SourceTokenScraper(),
      );
      expect(updateV2Function).is.calledOnce;
      expect(setTrigger).is.calledOnce;
      expect(setTrigger).is.calledAfter(updateV2Function);
    });

    it("aborts for failures midway", async () => {
      const ep = endpoint();
      const setTrigger = sinon.stub(fab, "setTrigger");
      const updateV1Function = sinon.stub(fab, "updateV1Function");
      updateV1Function.rejects(new reporter.DeploymentError(ep, "set invoker", undefined));

      await expect(
        fab.updateEndpoint(
          { endpoint: ep },
          new scraper.SourceTokenScraper(),
          new scraper.SourceTokenScraper(),
        ),
      ).to.be.rejectedWith(reporter.DeploymentError, "set invoker");
      expect(updateV1Function).is.calledOnce;
      expect(setTrigger).is.not.called;
    });

    it("can delete and create", async () => {
      const target = endpoint(
        { scheduleTrigger: { schedule: "every 5 minutes" } },
        { platform: "gcfv2" },
      );
      const before = endpoint(
        { scheduleTrigger: { schedule: "every 5 minutes" } },
        { platform: "gcfv1" },
      );
      const update = {
        endpoint: target,
        deleteAndRecreate: before,
      };

      const deleteTrigger = sinon.stub(fab, "deleteTrigger");
      deleteTrigger.resolves();
      const setTrigger = sinon.stub(fab, "setTrigger");
      setTrigger.resolves();
      const deleteV1Function = sinon.stub(fab, "deleteV1Function");
      deleteV1Function.resolves();
      const createV2Function = sinon.stub(fab, "createV2Function");
      createV2Function.resolves();

      await fab.updateEndpoint(
        update,
        new scraper.SourceTokenScraper(),
        new scraper.SourceTokenScraper(),
      );

      expect(deleteTrigger).to.have.been.called;
      expect(deleteV1Function).to.have.been.calledImmediatelyAfter(deleteTrigger);
      expect(createV2Function).to.have.been.calledImmediatelyAfter(deleteV1Function);
      expect(setTrigger).to.have.been.calledImmediatelyAfter(createV2Function);
    });
  });

  describe("deleteEndpoint", () => {
    it("deletes v1 functions", async () => {
      const ep = endpoint();
      const deleteTrigger = sinon.stub(fab, "deleteTrigger");
      deleteTrigger.resolves();
      const deleteV1Function = sinon.stub(fab, "deleteV1Function");
      deleteV1Function.resolves();

      await fab.deleteEndpoint(ep);
      expect(deleteTrigger).to.have.been.called;
      expect(deleteV1Function).to.have.been.calledImmediatelyAfter(deleteTrigger);
    });

    it("deletes v2 functions", async () => {
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const deleteTrigger = sinon.stub(fab, "deleteTrigger");
      deleteTrigger.resolves();
      const deleteV2Function = sinon.stub(fab, "deleteV2Function");
      deleteV2Function.resolves();

      await fab.deleteEndpoint(ep);
      expect(deleteTrigger).to.have.been.called;
      expect(deleteV2Function).to.have.been.calledImmediatelyAfter(deleteTrigger);
    });

    it("does not delete functions with triggers outstanding", async () => {
      const ep = endpoint({ httpsTrigger: {} }, { platform: "gcfv2" });
      const deleteV2Function = sinon.stub(fab, "deleteV2Function");
      const deleteTrigger = sinon.stub(fab, "deleteTrigger");
      deleteTrigger.rejects(new reporter.DeploymentError(ep, "delete schedule", undefined));
      deleteV2Function.resolves();

      await expect(fab.deleteEndpoint(ep)).to.eventually.be.rejected;
      expect(deleteV2Function).to.not.have.been.called;
    });
  });

  describe("applyRegionalUpdates", () => {
    it("shares source token scrapers across upserts", async () => {
      const ep1 = endpoint({ httpsTrigger: {} }, { id: "A" });
      const ep2 = endpoint({ httpsTrigger: {} }, { id: "B" });
      const ep3 = endpoint({ httpsTrigger: {} }, { id: "C" });
      const changes: planner.Changeset = {
        endpointsToCreate: [ep1, ep2],
        endpointsToUpdate: [{ endpoint: ep3 }],
        endpointsToDelete: [],
        endpointsToSkip: [],
      };

      let sourceTokenScraper: scraper.SourceTokenScraper | undefined;
      let callCount = 0;
      const fakeUpsert = (
        unused: backend.Endpoint | planner.EndpointUpdate,
        s: scraper.SourceTokenScraper,
      ): Promise<void> => {
        callCount++;
        if (!sourceTokenScraper) {
          expect(callCount).to.equal(1);
          sourceTokenScraper = s;
        }
        expect(s).to.equal(sourceTokenScraper);
        return Promise.resolve();
      };

      const createEndpoint = sinon.stub(fab, "createEndpoint");
      createEndpoint.callsFake(fakeUpsert);
      const updateEndpoint = sinon.stub(fab, "updateEndpoint");
      updateEndpoint.callsFake(fakeUpsert);

      await fab.applyChangeset(changes);
    });

    it("handles errors and wraps them in results", async () => {
      // when it hits a real API it will fail.
      const ep = endpoint();
      const changes: planner.Changeset = {
        endpointsToCreate: [ep],
        endpointsToUpdate: [],
        endpointsToDelete: [],
        endpointsToSkip: [],
      };

      const results = await fab.applyChangeset(changes);
      expect(results[0].error).to.be.instanceOf(reporter.DeploymentError);
      expect(results[0].error?.message).to.match(/create function/);
    });
  });

  describe("getLogSuccessMessage", () => {
    it("should return appropriate messaging for create case", () => {
      const ep = endpoint({ httpsTrigger: {} }, { id: "potato" });

      const message = fab.getLogSuccessMessage("create", ep);

      expect(message).to.contain(`functions[potato(us-central1)]`);
      expect(message).to.contain(`Successful create operation`);
    });

    it("should return appropriate messaging for skip case", () => {
      const ep = endpoint({ httpsTrigger: {} }, { id: "tomato" });
      ep.hash = "hashyhash";

      const message = fab.getLogSuccessMessage("skip", ep);

      expect(message).to.contain(`functions[tomato(us-central1)]`);
      expect(message).to.contain(`Skipped (No changes detected)`);
    });
  });

  describe("getSkippedDeployingNopOpMessage", () => {
    it("should return appropriate messaging", () => {
      const ep1 = endpoint({ httpsTrigger: {} }, { id: "function1" });
      const ep2 = endpoint({ httpsTrigger: {} }, { id: "function2" });

      const message = fab.getSkippedDeployingNopOpMessage([ep1, ep2]);

      expect(message).to.contain(`functions:`);
      expect(message).to.contain(`You can re-deploy skipped functions with:`);
      expect(message).to.contain(`firebase deploy --only functions:function1,function2`);
      expect(message).to.contain(`FUNCTIONS_DEPLOY_UNCHANGED=true firebase deploy`);
    });
  });

  it("does not delete if there are upsert errors", async () => {
    // when it hits a real API it will fail.
    const createEP = endpoint({ httpsTrigger: {} }, { id: "A" });
    const deleteEP = endpoint({ httpsTrigger: {} }, { id: "B" });
    const changes: planner.Changeset = {
      endpointsToCreate: [createEP],
      endpointsToUpdate: [],
      endpointsToDelete: [deleteEP],
      endpointsToSkip: [],
    };

    const results = await fab.applyChangeset(changes);
    const result = results.find((r) => r.endpoint.id === deleteEP.id);
    expect(result?.error).to.be.instanceOf(reporter.AbortedDeploymentError);
    expect(result?.durationMs).to.equal(0);
  });

  it("applies all kinds of changes", async () => {
    const createEP = endpoint({ httpsTrigger: {} }, { id: "A" });
    const updateEP = endpoint({ httpsTrigger: {} }, { id: "B" });
    const deleteEP = endpoint({ httpsTrigger: {} }, { id: "C" });
    const skipEP = endpoint({ httpsTrigger: {} }, { id: "D" });
    const update: planner.EndpointUpdate = { endpoint: updateEP };
    const changes: planner.Changeset = {
      endpointsToCreate: [createEP],
      endpointsToUpdate: [update],
      endpointsToDelete: [deleteEP],
      endpointsToSkip: [skipEP],
    };

    const createEndpoint = sinon.stub(fab, "createEndpoint");
    createEndpoint.resolves();
    const updateEndpoint = sinon.stub(fab, "updateEndpoint");
    updateEndpoint.resolves();
    const deleteEndpoint = sinon.stub(fab, "deleteEndpoint");
    deleteEndpoint.resolves();

    const results = await fab.applyChangeset(changes);
    expect(createEndpoint).to.have.been.calledWithMatch(createEP);
    expect(updateEndpoint).to.have.been.calledWithMatch(update);
    expect(deleteEndpoint).to.have.been.calledWith(deleteEP);

    // We can't actually verify that the timing isn't zero because tests
    // have run in <1ms and failed.
    expect(results[0].error).to.be.undefined;
    expect(results[1].error).to.be.undefined;
    expect(results[2].error).to.be.undefined;
  });

  describe("applyPlan", () => {
    it("fans out to regions", async () => {
      const ep1 = endpoint({ httpsTrigger: {} }, { region: "us-central1" });
      const ep2 = endpoint({ httpsTrigger: {} }, { region: "us-west1" });
      const plan: planner.DeploymentPlan = {
        "us-central1": {
          endpointsToCreate: [ep1],
          endpointsToUpdate: [],
          endpointsToDelete: [],
          endpointsToSkip: [],
        },
        "us-west1": {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [ep2],
          endpointsToSkip: [],
        },
      };

      // Will fail when it hits actual API calls
      const summary = await fab.applyPlan(plan);
      const ep1Result = summary.results.find((r) => r.endpoint.region === ep1.region);
      expect(ep1Result?.error).to.be.instanceOf(reporter.DeploymentError);
      expect(ep1Result?.error?.message).to.match(/create function/);

      const ep2Result = summary.results.find((r) => r.endpoint.region === ep2.region);
      expect(ep2Result?.error).to.be.instanceOf(reporter.DeploymentError);
      expect(ep2Result?.error?.message).to.match(/delete function/);
    });
  });
});
