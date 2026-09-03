import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import { expect } from "chai";
import * as sinon from "sinon";

import * as python from ".";
import * as pythonUtils from "../../../../functions/python";
import { IS_WINDOWS } from "../../../../utils";

const PROJECT_ID = "test-project";
const SOURCE_DIR = "/some/path/fns";

describe("PythonDelegate", () => {
  describe("getPythonBinary", () => {
    let platformMock: sinon.SinonStub;

    beforeEach(() => {
      platformMock = sinon.stub(process, "platform");
    });

    afterEach(() => {
      platformMock.restore();
    });

    it("returns specific version of the python binary corresponding to the runtime", () => {
      platformMock.value("darwin");
      const requestedRuntime = "python310";
      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, requestedRuntime);

      expect(delegate.getPythonBinary()).to.equal("python3.10");
    });

    it("always returns version-neutral, python.exe on windows", () => {
      platformMock.value("win32");
      const requestedRuntime = "python310";
      const delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, requestedRuntime);

      expect(delegate.getPythonBinary()).to.equal("python.exe");
    });
  });

  describe("serveAdmin", () => {
    const ADMIN_PORT = 8081;
    // Mirrors the constants in ./index.ts.
    const FORCE_KILL_DELAY_MS = 10_000;
    const SHUTDOWN_TIMEOUT_MS = 15_000;

    let sandbox: sinon.SinonSandbox;
    let clock: sinon.SinonFakeTimers;
    let child: ChildProcess;
    let runWithVirtualEnvStub: sinon.SinonStub;
    let killProcessTreeStub: sinon.SinonStub;
    let fetchStub: sinon.SinonStub;
    let destroyStdoutStub: sinon.SinonStub;
    let destroyStderrStub: sinon.SinonStub;
    let unrefStub: sinon.SinonStub;
    let delegate: python.Delegate;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      child = new EventEmitter() as ChildProcess;
      destroyStdoutStub = sandbox.stub();
      destroyStderrStub = sandbox.stub();
      unrefStub = sandbox.stub();
      Object.assign(child, {
        pid: 4242,
        exitCode: null,
        signalCode: null,
        stdout: Object.assign(new EventEmitter(), { destroy: destroyStdoutStub }),
        stderr: Object.assign(new EventEmitter(), { destroy: destroyStderrStub }),
        unref: unrefStub,
      });
      runWithVirtualEnvStub = sandbox.stub(pythonUtils, "runWithVirtualEnv").returns(child);
      killProcessTreeStub = sandbox.stub(pythonUtils, "killProcessTree");
      // Tracking installs real process-level signal handlers; not under test here.
      sandbox.stub(pythonUtils, "trackVirtualEnvChild");
      sandbox.stub(pythonUtils, "untrackVirtualEnvChild");
      fetchStub = sandbox.stub(global, "fetch" as never);
      delegate = new python.Delegate(PROJECT_ID, SOURCE_DIR, "python312");
      sandbox.stub(delegate, "modulesDir").resolves("/some/site-packages/firebase_functions");
      clock = sandbox.useFakeTimers();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("spawns detached so the kill can reach Python under the venv shell wrapper", async () => {
      await delegate.serveAdmin(ADMIN_PORT, {});

      const spawnOpts = runWithVirtualEnvStub.firstCall.args[3] as { detached: boolean };
      expect(spawnOpts.detached).to.equal(!IS_WINDOWS);
    });

    it("asks the server to quit and resolves once it exits", async () => {
      fetchStub.resolves(new Response("", { status: 200 }));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      const shutdown = killProcess();
      child.emit("exit", 0);
      await shutdown;

      expect(fetchStub.firstCall.args[0]).to.equal(
        `http://127.0.0.1:${ADMIN_PORT}/__/quitquitquit`,
      );
      expect(killProcessTreeStub).to.not.have.been.called;
    });

    it("force-kills the process group when the server never answers quitquitquit", async () => {
      // A wedged server: bound to the port but not accepting connections.
      fetchStub.rejects(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      const shutdown = killProcess();
      await clock.tickAsync(FORCE_KILL_DELAY_MS);

      expect(killProcessTreeStub).to.have.been.calledOnceWithExactly(4242);

      child.emit("exit", null, "SIGKILL");
      await shutdown;
    });

    it("gives up instead of hanging the deploy when the process refuses to die", async () => {
      fetchStub.rejects(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      // The child never emits "exit". Before the fix this awaited forever, which
      // is what left CI deploys hanging until the job timeout.
      const shutdown = killProcess();
      let settled = false;
      void shutdown.then(() => (settled = true));

      await clock.tickAsync(SHUTDOWN_TIMEOUT_MS);
      await shutdown;

      expect(settled).to.be.true;
    });

    it("releases the surviving child's handles so it cannot hold the CLI open", async () => {
      fetchStub.rejects(Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      const shutdown = killProcess();
      await clock.tickAsync(SHUTDOWN_TIMEOUT_MS);
      await shutdown;

      // A detached child and its pipes each keep the event loop alive, which
      // would move the hang from the deploy to process exit rather than fix it.
      expect(destroyStdoutStub).to.have.been.called;
      expect(destroyStderrStub).to.have.been.called;
      expect(unrefStub).to.have.been.called;
    });

    it("does not reject when the child errors, so the real discovery error survives", async () => {
      fetchStub.rejects(new Error("connect ECONNREFUSED"));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      const shutdown = killProcess();
      child.emit("error", new Error("spawn failed"));

      await shutdown;
    });

    it("returns immediately when the server died before shutdown was called", async () => {
      fetchStub.rejects(new Error("connect ECONNREFUSED"));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      // A server that failed to start, e.g. a venv that could not be activated.
      // "exit" does not replay, so a listener attached at shutdown time would
      // never fire and the deploy would stall for SHUTDOWN_TIMEOUT_MS.
      child.emit("exit", 1);

      const shutdown = killProcess();
      let settled = false;
      void shutdown.then(() => (settled = true));

      await clock.tickAsync(0);
      expect(settled).to.be.true;
      await shutdown;

      // Nothing left alive, so we must not signal a pid that has been reaped
      // and possibly recycled.
      await clock.tickAsync(FORCE_KILL_DELAY_MS);
      expect(killProcessTreeStub).to.not.have.been.called;
    });

    it("returns immediately when the child failed to spawn before shutdown was called", async () => {
      fetchStub.rejects(new Error("connect ECONNREFUSED"));
      const killProcess = await delegate.serveAdmin(ADMIN_PORT, {});

      // A spawn failure leaves exitCode and signalCode null, so checking those
      // is not enough on its own to notice the process is gone.
      child.emit("error", new Error("spawn ENOENT"));

      const shutdown = killProcess();
      let settled = false;
      void shutdown.then(() => (settled = true));

      await clock.tickAsync(0);
      expect(settled).to.be.true;
      await shutdown;
    });
  });
});
