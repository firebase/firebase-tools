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
  let sandbox: sinon.SinonSandbox;
  let killStub: sinon.SinonStub;
  let child: ChildProcess;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    killStub = sandbox.stub(process, "kill");
    child = new EventEmitter() as ChildProcess;
    Object.assign(child, { pid: 4242 });
  });

  afterEach(() => {
    untrackVirtualEnvChild(child);
    sandbox.restore();
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
