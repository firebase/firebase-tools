import { expect } from "chai";
import { FSWatcher } from "chokidar";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import * as downloadableEmulators from "./downloadableEmulators";
import { FirestoreEmulator } from "./firestoreEmulator";
import * as utils from "../utils";

/** Returns the emulator's rules watcher, failing the test if it was not created. */
function rulesWatcherOf(emulator: FirestoreEmulator): FSWatcher {
  const watcher = emulator.rulesWatcher;
  expect(watcher, "rules watcher should be created").to.not.be.undefined;
  return watcher as FSWatcher;
}

describe("FirestoreEmulator", () => {
  const sandbox = sinon.createSandbox();
  let logLabeledWarningStub: sinon.SinonStub;
  let tmpDir: string;
  let rulesPath: string;
  let emulator: FirestoreEmulator | undefined;

  beforeEach(() => {
    sandbox.stub(downloadableEmulators, "start").resolves();
    sandbox.stub(downloadableEmulators, "stop").resolves();
    logLabeledWarningStub = sandbox.stub(utils, "logLabeledWarning");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firestore-emulator-spec-"));
    rulesPath = path.join(tmpDir, "firestore.rules");
    fs.writeFileSync(rulesPath, "rules_version = '2';");
  });

  afterEach(async () => {
    sandbox.restore();
    // Close the watcher even if a test failed before reaching stop(), so nothing keeps tmpDir open.
    await emulator?.rulesWatcher?.close();
    emulator = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("does not watch a rules file when none is configured", async () => {
    emulator = new FirestoreEmulator({ project_id: "demo-test" });
    await emulator.start();

    expect(emulator.rulesWatcher).to.be.undefined;
    await emulator.stop();
  });

  it("logs a warning instead of exiting when the rules watcher fails", async () => {
    emulator = new FirestoreEmulator({ project_id: "demo-test", rules: rulesPath });
    await emulator.start();
    const watcher = rulesWatcherOf(emulator);

    // Without an "error" listener, EventEmitter#emit throws, which is what terminated the CLI (#4298).
    const err = new Error("ENOSPC: System limit for number of file watchers reached");
    expect(() => watcher.emit("error", err)).to.not.throw();

    expect(logLabeledWarningStub).to.have.been.calledOnce;
    const [label, message] = logLabeledWarningStub.firstCall.args as [string, string];
    expect(label).to.equal("firestore");
    expect(message).to.include(rulesPath).and.to.include("ENOSPC");
    await emulator.stop();
  });

  it("handles a non-Error value emitted by the rules watcher", async () => {
    emulator = new FirestoreEmulator({ project_id: "demo-test", rules: rulesPath });
    await emulator.start();
    const watcher = rulesWatcherOf(emulator);
    expect(() => watcher.emit("error", "watcher exploded")).to.not.throw();
    expect(logLabeledWarningStub).to.have.been.calledOnce;
    const [, message] = logLabeledWarningStub.firstCall.args as [string, string];
    expect(message).to.include("watcher exploded");
    await emulator.stop();
  });

  it("closes the rules watcher on stop", async () => {
    emulator = new FirestoreEmulator({ project_id: "demo-test", rules: rulesPath });
    await emulator.start();
    const closeSpy = sandbox.spy(rulesWatcherOf(emulator), "close");

    await emulator.stop();

    expect(closeSpy).to.have.been.calledOnce;
  });
});
