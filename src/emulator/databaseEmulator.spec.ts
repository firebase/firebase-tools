import { expect } from "chai";
import * as chokidar from "chokidar";
import * as sinon from "sinon";

import { DatabaseEmulator } from "./databaseEmulator";
import * as downloadableEmulators from "./downloadableEmulators";
import { Emulators } from "./types";

describe("DatabaseEmulator", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("stop", () => {
    it("should close rulesWatcher when one was created on start", async () => {
      const fakeWatcher = sandbox.createStubInstance(chokidar.FSWatcher);
      fakeWatcher.close.resolves();
      fakeWatcher.on.returns(fakeWatcher);
      sandbox.stub(chokidar, "watch").returns(fakeWatcher);
      sandbox.stub(downloadableEmulators, "start").resolves();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({
        rules: [{ instance: "test-instance", rules: "database.rules.json" }],
      });

      await emulator.start();
      await emulator.stop();

      expect(fakeWatcher.close.calledOnce).to.be.true;
      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;

      // Subsequent stop should be a no-op for rulesWatchers
      await emulator.stop();
      expect(fakeWatcher.close.calledOnce).to.be.true;
    });

    it("should close all rulesWatchers when multiple rules instances are configured", async () => {
      const fakeWatcher1 = sandbox.createStubInstance(chokidar.FSWatcher);
      fakeWatcher1.close.resolves();
      fakeWatcher1.on.returns(fakeWatcher1);

      const fakeWatcher2 = sandbox.createStubInstance(chokidar.FSWatcher);
      fakeWatcher2.close.resolves();
      fakeWatcher2.on.returns(fakeWatcher2);

      const watchStub = sandbox.stub(chokidar, "watch");
      watchStub.onFirstCall().returns(fakeWatcher1);
      watchStub.onSecondCall().returns(fakeWatcher2);

      sandbox.stub(downloadableEmulators, "start").resolves();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({
        rules: [
          { instance: "inst-1", rules: "rules-1.json" },
          { instance: "inst-2", rules: "rules-2.json" },
        ],
      });

      await emulator.start();
      await emulator.stop();

      expect(fakeWatcher1.close.calledOnce).to.be.true;
      expect(fakeWatcher2.close.calledOnce).to.be.true;
      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;
    });

    it("should continue to stop emulator even if closing a rulesWatcher rejects", async () => {
      const fakeWatcher = sandbox.createStubInstance(chokidar.FSWatcher);
      fakeWatcher.close.rejects(new Error("Close failed"));
      fakeWatcher.on.returns(fakeWatcher);
      sandbox.stub(chokidar, "watch").returns(fakeWatcher);
      sandbox.stub(downloadableEmulators, "start").resolves();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({
        rules: [{ instance: "test-instance", rules: "database.rules.json" }],
      });

      await emulator.start();
      await emulator.stop();

      expect(fakeWatcher.close.calledOnce).to.be.true;
      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;
    });

    it("should succeed when rulesWatcher was never created", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({});
      await emulator.stop();

      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;
    });
  });
});
