import { expect } from "chai";
import * as sinon from "sinon";

import * as utils from "../utils";
import { EmulatorLogger, Verbosity } from "./emulatorLogger";
import { EmulatorLog, Emulators } from "./types";

function systemLog(type: string, href: string): EmulatorLog {
  return new EmulatorLog("SYSTEM", type, "", { href, module: "https" });
}

describe("EmulatorLogger", () => {
  let logWarning: sinon.SinonStub;

  beforeEach(() => {
    EmulatorLogger.warnOnceCache.clear();
    EmulatorLogger.setVerbosity(Verbosity.DEBUG);
    logWarning = sinon.stub(utils, "logWarning");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
    EmulatorLogger.warnOnceCache.clear();
    EmulatorLogger.setVerbosity(Verbosity.DEBUG);
  });

  describe("network access warnings", () => {
    // The runtime dedupes by href, but that cache lives in the runtime process.
    // A fresh logger here stands in for a fresh runtime from the worker pool.
    it("warns once for a repeated external URL, across runtimes", () => {
      for (let i = 0; i < 3; i++) {
        EmulatorLogger.forEmulator(Emulators.FUNCTIONS).handleRuntimeLog(
          systemLog("unidentified-network-access", "https://api.example.com/v1/thing"),
        );
      }

      expect(logWarning).to.have.callCount(1);
      expect(logWarning.firstCall.args[0]).to.contain("External network resource requested!");
      expect(logWarning.firstCall.args[0]).to.contain("https://api.example.com/v1/thing");
    });

    it("warns once per distinct external URL", () => {
      const logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
      logger.handleRuntimeLog(systemLog("unidentified-network-access", "https://one.example.com/"));
      logger.handleRuntimeLog(systemLog("unidentified-network-access", "https://two.example.com/"));
      logger.handleRuntimeLog(systemLog("unidentified-network-access", "https://one.example.com/"));

      expect(logWarning).to.have.callCount(2);
      expect(logWarning.getCall(0).args[0]).to.contain("https://one.example.com/");
      expect(logWarning.getCall(1).args[0]).to.contain("https://two.example.com/");
    });

    it("warns once for a repeated Google API URL, across runtimes", () => {
      for (let i = 0; i < 3; i++) {
        EmulatorLogger.forEmulator(Emulators.FUNCTIONS).handleRuntimeLog(
          systemLog("googleapis-network-access", "https://firestore.googleapis.com/v1/x"),
        );
      }

      expect(logWarning).to.have.callCount(1);
      expect(logWarning.firstCall.args[0]).to.contain("Google API requested!");
      expect(logWarning.firstCall.args[0]).to.contain("https://firestore.googleapis.com/v1/x");
    });

    it("keeps the two kinds of network warning separate", () => {
      const logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
      logger.handleRuntimeLog(systemLog("googleapis-network-access", "https://x.googleapis.com/"));
      logger.handleRuntimeLog(systemLog("unidentified-network-access", "https://x.example.com/"));

      expect(logWarning).to.have.callCount(2);
    });
  });

  describe("other system warnings", () => {
    it("still warns every time for warnings that are not deduped", () => {
      const logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
      for (let i = 0; i < 3; i++) {
        logger.handleRuntimeLog(new EmulatorLog("SYSTEM", "non-default-admin-app-used", ""));
      }

      expect(logWarning).to.have.callCount(3);
    });
  });
});
