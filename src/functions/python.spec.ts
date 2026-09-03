import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import { expect } from "chai";
import * as sinon from "sinon";

import { killProcessTree, trackVirtualEnvChild, untrackVirtualEnvChild } from "./python";
import { IS_WINDOWS } from "../utils";

// Process groups and POSIX signals do not exist on Windows, where killProcessTree
// shells out to taskkill instead.
const itPosix = IS_WINDOWS ? it.skip : it;

describe("killProcessTree", () => {
  let sandbox: sinon.SinonSandbox;
  let killStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    killStub = sandbox.stub(process, "kill");
  });

  afterEach(() => {
    sandbox.restore();
  });

  itPosix("signals the whole process group, not just the shell pid", () => {
    killProcessTree(4242);

    // A negative pid is what makes this reach the Python process underneath the
    // `. venv/bin/activate && python ...` shell wrapper.
    expect(killStub).to.have.been.calledOnceWithExactly(-4242, "SIGKILL");
  });

  itPosix("does not throw when the process group has already exited", () => {
    const esrch = Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
    killStub.throws(esrch);

    expect(() => killProcessTree(4242)).to.not.throw();
  });

  for (const pid of [0, -1, NaN]) {
    it(`refuses to signal anything for a pid of ${pid}`, () => {
      // process.kill(-0, ...) would signal the CLI's own process group, i.e.
      // kill the very process trying to do the cleanup.
      killProcessTree(pid);

      expect(killStub).to.not.have.been.called;
    });
  }
});

describe("virtual env child tracking", () => {
  const CLEANUP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

  let sandbox: sinon.SinonSandbox;
  let killStub: sinon.SinonStub;
  let child: ChildProcess;
  let foreignListeners: Map<NodeJS.Signals, NodeJS.SignalsListener[]>;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    killStub = sandbox.stub(process, "kill");
    child = new EventEmitter() as ChildProcess;
    // A live ChildProcess reports null for both, not undefined.
    Object.assign(child, { pid: 4242, exitCode: null, signalCode: null });

    // The re-raise is gated on nothing else listening for the signal, and the
    // test runner brings its own listeners: nyc registers one per signal to
    // flush coverage. Detach them so these tests see a bare process, and so a
    // synthetic process.emit does not reach them.
    foreignListeners = new Map();
    for (const signal of CLEANUP_SIGNALS) {
      foreignListeners.set(signal, process.listeners(signal) as NodeJS.SignalsListener[]);
      process.removeAllListeners(signal);
    }
  });

  afterEach(() => {
    untrackVirtualEnvChild(child);
    sandbox.restore();
    for (const [signal, listeners] of foreignListeners) {
      process.removeAllListeners(signal);
      for (const listener of listeners) {
        process.on(signal, listener);
      }
    }
  });

  itPosix("force-kills tracked children on SIGTERM, the signal CI sends on cancellation", () => {
    // A co-listener keeps process.listenerCount() above zero after our handler
    // removes itself, so the handler does not re-raise and end the test run.
    const coListener = (): void => undefined;
    process.on("SIGTERM", coListener);
    try {
      trackVirtualEnvChild(child);
      process.emit("SIGTERM", "SIGTERM");

      expect(killStub).to.have.been.calledOnceWithExactly(-4242, "SIGKILL");
    } finally {
      process.removeListener("SIGTERM", coListener);
    }
  });

  itPosix("re-raises the signal once cleanup is done so the exit code is preserved", () => {
    trackVirtualEnvChild(child);
    process.emit("SIGTERM", "SIGTERM");

    // Once for the child's process group, once to re-raise on ourselves.
    expect(killStub).to.have.been.calledWithExactly(-4242, "SIGKILL");
    expect(killStub).to.have.been.calledWithExactly(process.pid, "SIGTERM");
  });

  itPosix("force-kills tracked children on SIGQUIT", () => {
    // Ctrl-\ reaches the foreground process group only, and a detached child is
    // in its own group, so nothing kills it unless this handler does.
    const coListener = (): void => undefined;
    process.on("SIGQUIT", coListener);
    try {
      trackVirtualEnvChild(child);
      process.emit("SIGQUIT", "SIGQUIT");

      expect(killStub).to.have.been.calledOnceWithExactly(-4242, "SIGKILL");
    } finally {
      process.removeListener("SIGQUIT", coListener);
    }
  });

  itPosix("does not signal a child that has already exited", () => {
    const coListener = (): void => undefined;
    process.on("SIGTERM", coListener);
    try {
      trackVirtualEnvChild(child);
      // Reaped by now, so the pid may belong to an unrelated process group.
      Object.assign(child, { exitCode: 0 });
      process.emit("SIGTERM", "SIGTERM");

      expect(killStub).to.not.have.been.calledWith(-4242);
    } finally {
      process.removeListener("SIGTERM", coListener);
    }
  });

  it("restores default signal behaviour once nothing is left to clean up", () => {
    const before = process.listenerCount("SIGTERM");
    trackVirtualEnvChild(child);
    expect(process.listenerCount("SIGTERM")).to.equal(before + 1);

    untrackVirtualEnvChild(child);
    expect(process.listenerCount("SIGTERM")).to.equal(before);
  });

  it("keeps handlers installed while other children are still tracked", () => {
    const other = new EventEmitter() as ChildProcess;
    Object.assign(other, { pid: 4343 });
    const before = process.listenerCount("SIGTERM");

    trackVirtualEnvChild(child);
    trackVirtualEnvChild(other);
    untrackVirtualEnvChild(child);
    expect(process.listenerCount("SIGTERM")).to.equal(before + 1);

    untrackVirtualEnvChild(other);
    expect(process.listenerCount("SIGTERM")).to.equal(before);
  });
});
