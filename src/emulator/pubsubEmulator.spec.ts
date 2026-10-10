import { expect } from "chai";
import * as sinon from "sinon";
import { PubsubEmulator, PubsubSubscription, PubsubClient } from "./pubsubEmulator";
import * as downloadableEmulators from "./downloadableEmulators";
import { Emulators } from "./types";

describe("PubsubEmulator", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("stop", () => {
    it("should gracefully stop when no subscriptions or client exist", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      await emulator.stop();

      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
      expect(emulator.triggersForTopic.size).to.equal(0);
    });

    it("should close active subscriptions and clear topic maps", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const closeStub1 = sandbox.stub().resolves();
      const closeStub2 = sandbox.stub().resolves();

      const fakeSub1: PubsubSubscription = {
        name: "emulator-sub-topic-1",
        close: closeStub1,
      };
      const fakeSub2: PubsubSubscription = {
        name: "emulator-sub-topic-2",
        close: closeStub2,
      };

      emulator.subscriptionForTopic.set("topic-1", fakeSub1);
      emulator.subscriptionForTopic.set("topic-2", fakeSub2);
      emulator.triggersForTopic.set("topic-1", [
        { triggerKey: "trigger-1", signatureType: "event" },
      ]);

      await emulator.stop();

      expect(closeStub1.calledOnce).to.be.true;
      expect(closeStub2.calledOnce).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
      expect(emulator.triggersForTopic.size).to.equal(0);
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });

    it("should close pubsub client and reset _pubsub property", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const closeStub = sandbox.stub().resolves();
      const fakePubSub: PubsubClient = {
        close: closeStub,
      };
      emulator._pubsub = fakePubSub;

      await emulator.stop();

      expect(closeStub.calledOnce).to.be.true;
      expect(emulator._pubsub).to.be.undefined;
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });

    it("should handle rejected subscription close calls gracefully and still stop emulator", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const failingCloseStub = sandbox.stub().rejects(new Error("Connection lost"));
      const succeedingCloseStub = sandbox.stub().resolves();

      const failingSub: PubsubSubscription = {
        name: "emulator-sub-failing",
        close: failingCloseStub,
      };
      const succeedingSub: PubsubSubscription = {
        name: "emulator-sub-succeeding",
        close: succeedingCloseStub,
      };

      emulator.subscriptionForTopic.set("failing", failingSub);
      emulator.subscriptionForTopic.set("succeeding", succeedingSub);

      await emulator.stop();

      expect(failingCloseStub.calledOnce).to.be.true;
      expect(succeedingCloseStub.calledOnce).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });

    it("should not hang when subscription close hangs indefinitely", async () => {
      const clock = sandbox.useFakeTimers();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const hangingSub: PubsubSubscription = {
        name: "emulator-sub-hanging",
        close: () => new Promise<void>(() => undefined),
      };

      emulator.subscriptionForTopic.set("hanging", hangingSub);

      const stopPromise = emulator.stop();
      await clock.tickAsync(2500);
      await stopPromise;

      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
    });

    it("should not hang when pubsub client close hangs indefinitely", async () => {
      const clock = sandbox.useFakeTimers();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const fakePubSub: PubsubClient = {
        close: () => new Promise<void>(() => undefined),
      };
      emulator._pubsub = fakePubSub;

      const stopPromise = emulator.stop();
      await clock.tickAsync(2500);
      await stopPromise;

      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
      expect(emulator._pubsub).to.be.undefined;
    });
  });

  describe("addTrigger", () => {
    it("should reuse existing subscription when addTrigger is called multiple times for the same topic", async () => {
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const fakeSub: PubsubSubscription = {
        name: "emulator-sub-topic-1",
        close: sandbox.stub().resolves(),
      };
      const createSubStub = sandbox.stub(emulator, "maybeCreateTopicAndSub").resolves(fakeSub);

      await emulator.addTrigger("topic-1", "trigger-1", "event");
      await emulator.addTrigger("topic-1", "trigger-2", "cloudevent");

      expect(createSubStub.calledOnce).to.be.true;
      expect(emulator.triggersForTopic.get("topic-1")?.length).to.equal(2);
      expect(emulator.subscriptionForTopic.get("topic-1")).to.equal(fakeSub);
    });

    it("should not add duplicate trigger when called with the same triggerKey", async () => {
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const fakeSub: PubsubSubscription = {
        name: "emulator-sub-topic-1",
        close: sandbox.stub().resolves(),
      };
      const createSubStub = sandbox.stub(emulator, "maybeCreateTopicAndSub").resolves(fakeSub);

      await emulator.addTrigger("topic-1", "trigger-1", "event");
      await emulator.addTrigger("topic-1", "trigger-1", "event");

      expect(createSubStub.calledOnce).to.be.true;
      expect(emulator.triggersForTopic.get("topic-1")?.length).to.equal(1);
    });
  });
});
