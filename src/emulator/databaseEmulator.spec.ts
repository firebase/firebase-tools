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
      const closeStub = sandbox.stub().resolves();
      const fakeWatcher = {
        close: closeStub,
        on: sandbox.stub().returnsThis(),
      } as unknown as chokidar.FSWatcher;
      sandbox.stub(chokidar, "watch").returns(fakeWatcher);
      sandbox.stub(downloadableEmulators, "start").resolves();
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({
        rules: [{ instance: "test-instance", rules: "database.rules.json" }],
      });

      await emulator.start();
      await emulator.stop();

      expect(closeStub.calledOnce).to.be.true;
      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;

      // Subsequent stop should be a no-op for rulesWatcher
      await emulator.stop();
      expect(closeStub.calledOnce).to.be.true;
    });

    it("should succeed when rulesWatcher was never created", async () => {
      const stopStub = sandbox.stub(downloadableEmulators, "stop").resolves();

      const emulator = new DatabaseEmulator({});
      await emulator.stop();

      expect(stopStub.calledWith(Emulators.DATABASE)).to.be.true;
    });
  });
});
