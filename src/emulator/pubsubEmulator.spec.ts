import { expect } from "chai";
import * as sinon from "sinon";
import { PubsubEmulator } from "./pubsubEmulator";
import * as downloadableEmulators from "./downloadableEmulators";
import { Emulators } from "./types";
import { Subscription } from "@google-cloud/pubsub";

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

      const fakeSub1 = {
        name: "emulator-sub-topic-1",
        close: sandbox.stub().resolves(),
      } as unknown as Subscription;
      const fakeSub2 = {
        name: "emulator-sub-topic-2",
        close: sandbox.stub().resolves(),
      } as unknown as Subscription;

      emulator.subscriptionForTopic.set("topic-1", fakeSub1);
      emulator.subscriptionForTopic.set("topic-2", fakeSub2);
      emulator.triggersForTopic.set("topic-1", [
        { triggerKey: "trigger-1", signatureType: "event" },
      ]);

      await emulator.stop();

      expect((fakeSub1.close as sinon.SinonStub).calledOnce).to.be.true;
      expect((fakeSub2.close as sinon.SinonStub).calledOnce).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
      expect(emulator.triggersForTopic.size).to.equal(0);
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });

    it("should close pubsub client and reset _pubsub property", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const closeStub = sandbox.stub().resolves();
      const emulatorWithClient = emulator as unknown as {
        _pubsub: { close: () => Promise<void> } | undefined;
      };
      emulatorWithClient._pubsub = {
        close: closeStub,
      };

      await emulator.stop();

      expect(closeStub.calledOnce).to.be.true;
      expect(emulatorWithClient._pubsub).to.be.undefined;
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });

    it("should handle rejected subscription close calls gracefully and still stop emulator", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();
      const emulator = new PubsubEmulator({ projectId: "test-project" });

      const failingSub = {
        name: "emulator-sub-failing",
        close: sandbox.stub().rejects(new Error("Connection lost")),
      } as unknown as Subscription;
      const succeedingSub = {
        name: "emulator-sub-succeeding",
        close: sandbox.stub().resolves(),
      } as unknown as Subscription;

      emulator.subscriptionForTopic.set("failing", failingSub);
      emulator.subscriptionForTopic.set("succeeding", succeedingSub);

      await emulator.stop();

      expect((failingSub.close as sinon.SinonStub).calledOnce).to.be.true;
      expect((succeedingSub.close as sinon.SinonStub).calledOnce).to.be.true;
      expect(emulator.subscriptionForTopic.size).to.equal(0);
      expect(stopStub.calledOnceWith(Emulators.PUBSUB)).to.be.true;
    });
  });
});
