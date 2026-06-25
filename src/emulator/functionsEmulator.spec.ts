import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as portfinder from "portfinder";
import * as sinon from "sinon";

import { FunctionsEmulator } from "./functionsEmulator";
import * as functionsPython from "../functions/python";

describe("FunctionsEmulator", () => {
  const sandbox = sinon.createSandbox();

  afterEach(async () => {
    sandbox.restore();
    await makeEmulator(true).stop();
  });

  function makeEmulator(pythonDisableGunicorn = false): FunctionsEmulator {
    return new FunctionsEmulator({
      projectId: "project-id",
      projectDir: "/workspace",
      emulatableBackends: [],
      debugPort: false,
      pythonDisableGunicorn,
    });
  }

  function makePythonBackend() {
    return {
      functionsDir: "/workspace/functions",
      codebase: "default",
      env: {},
      secretEnv: [],
      runtime: "python311",
    };
  }

  it("should inject a sitecustomize shim when pythonDisableGunicorn is enabled", async () => {
    sandbox.stub(portfinder, "getPortPromise").resolves(9191);
    const runWithVirtualEnv = sandbox.stub(functionsPython, "runWithVirtualEnv").returns({} as any);
    const mkdtempSync = sandbox.stub(fs, "mkdtempSync").returns("/tmp/firebase-tools-python-shim");
    const writeFileSync = sandbox.stub(fs, "writeFileSync");

    const emulator = makeEmulator(true);
    const logLabeled = sandbox.stub((emulator as any).logger, "logLabeled");

    await (emulator as any).startPython(makePythonBackend(), { PYTHONPATH: "/existing/path" });

    expect(runWithVirtualEnv).to.have.been.calledOnce;
    expect(runWithVirtualEnv.firstCall.args[0]).to.deep.equal(["functions-framework"]);
    expect(runWithVirtualEnv.firstCall.args[1]).to.equal("/workspace/functions");
    expect(runWithVirtualEnv.firstCall.args[2]).to.include({
      FIREBASE_FUNCTIONS_EMULATOR_DISABLE_GUNICORN: "1",
      PYTHONUNBUFFERED: "1",
      DEBUG: "False",
      HOST: "127.0.0.1",
      PORT: "9191",
    });
    expect(runWithVirtualEnv.firstCall.args[2].PYTHONPATH).to.equal(
      `/tmp/firebase-tools-python-shim${path.delimiter}/existing/path`,
    );
    expect(mkdtempSync).to.have.been.calledOnce;
    expect(writeFileSync).to.have.been.calledOnceWith(
      "/tmp/firebase-tools-python-shim/sitecustomize.py",
      sinon.match.string,
      "utf8",
    );
    const shim = writeFileSync.firstCall.args[1];
    expect(shim).to.include("PathFinder.find_spec(");
    expect(shim).to.include('"sitecustomize", _firebase_remaining_paths');
    expect(shim).to.include("module_from_spec");
    expect(shim).to.include('sys.modules["sitecustomize"] = _firebase_user_sitecustomize_module');
    expect(shim).to.include("exec_module");
    expect(logLabeled).to.have.been.calledOnceWith(
      "BULLET",
      "functions",
      "Python emulator gunicorn disabled; using Flask server in non-debug mode.",
    );
  });

  it("should leave python runtime envs unchanged when pythonDisableGunicorn is disabled", async () => {
    sandbox.stub(portfinder, "getPortPromise").resolves(9292);
    const runWithVirtualEnv = sandbox.stub(functionsPython, "runWithVirtualEnv").returns({} as any);
    const mkdtempSync = sandbox.stub(fs, "mkdtempSync");
    const writeFileSync = sandbox.stub(fs, "writeFileSync");

    const emulator = makeEmulator(false);
    const logLabeled = sandbox.stub((emulator as any).logger, "logLabeled");

    await (emulator as any).startPython(makePythonBackend(), {});

    expect(runWithVirtualEnv).to.have.been.calledOnce;
    expect(runWithVirtualEnv.firstCall.args[2]).to.include({
      PYTHONUNBUFFERED: "1",
      DEBUG: "False",
      HOST: "127.0.0.1",
      PORT: "9292",
    });
    expect(runWithVirtualEnv.firstCall.args[2]).to.not.have.property(
      "FIREBASE_FUNCTIONS_EMULATOR_DISABLE_GUNICORN",
    );
    expect(runWithVirtualEnv.firstCall.args[2].PYTHONPATH).to.equal(process.env.PYTHONPATH);
    expect(mkdtempSync).to.not.have.been.called;
    expect(writeFileSync).to.not.have.been.called;
    expect(logLabeled).to.not.have.been.called;
  });

  it("should recursively remove the shim dir during stop and clear the cached path", async () => {
    sandbox.stub(portfinder, "getPortPromise").resolves(9393);
    const runWithVirtualEnv = sandbox.stub(functionsPython, "runWithVirtualEnv").returns({} as any);
    const mkdtempSync = sandbox.stub(fs, "mkdtempSync");
    mkdtempSync.onFirstCall().returns("/tmp/firebase-tools-python-shim-one");
    mkdtempSync.onSecondCall().returns("/tmp/firebase-tools-python-shim-two");
    sandbox.stub(fs, "writeFileSync");
    const rmSync = sandbox.stub(fs, "rmSync");

    const emulator = makeEmulator(true);

    await (emulator as any).startPython(makePythonBackend(), {});
    await emulator.stop();
    await (emulator as any).startPython(makePythonBackend(), {});

    expect(rmSync).to.have.been.calledOnceWith("/tmp/firebase-tools-python-shim-one", {
      recursive: true,
    });
    expect(mkdtempSync).to.have.been.calledTwice;
    expect(runWithVirtualEnv.secondCall.args[2].PYTHONPATH).to.equal(
      "/tmp/firebase-tools-python-shim-two",
    );
  });

  it("should ignore ENOENT during shim dir cleanup and clear the cached path", async () => {
    sandbox.stub(portfinder, "getPortPromise").resolves(9494);
    const runWithVirtualEnv = sandbox.stub(functionsPython, "runWithVirtualEnv").returns({} as any);
    const mkdtempSync = sandbox.stub(fs, "mkdtempSync");
    mkdtempSync.onFirstCall().returns("/tmp/firebase-tools-python-shim-missing");
    mkdtempSync.onSecondCall().returns("/tmp/firebase-tools-python-shim-recreated");
    sandbox.stub(fs, "writeFileSync");
    const rmSync = sandbox
      .stub(fs, "rmSync")
      .throws(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const emulator = makeEmulator(true);
    const log = sandbox.stub((emulator as any).logger, "log");

    await (emulator as any).startPython(makePythonBackend(), {});
    await emulator.stop();
    await (emulator as any).startPython(makePythonBackend(), {});

    expect(rmSync).to.have.been.calledOnceWith("/tmp/firebase-tools-python-shim-missing", {
      recursive: true,
    });
    expect(mkdtempSync).to.have.been.calledTwice;
    expect(runWithVirtualEnv.secondCall.args[2].PYTHONPATH).to.equal(
      "/tmp/firebase-tools-python-shim-recreated",
    );
    expect(log).to.not.have.been.called;
  });

  it("should recreate the shim dir after cleanup fails with a non-ENOENT error", async () => {
    sandbox.stub(portfinder, "getPortPromise").resolves(9595);
    const runWithVirtualEnv = sandbox.stub(functionsPython, "runWithVirtualEnv").returns({} as any);
    const mkdtempSync = sandbox.stub(fs, "mkdtempSync");
    mkdtempSync.onFirstCall().returns("/tmp/firebase-tools-python-shim-error");
    mkdtempSync.onSecondCall().returns("/tmp/firebase-tools-python-shim-recreated");
    sandbox.stub(fs, "writeFileSync");
    const rmSync = sandbox.stub(fs, "rmSync").throws(new Error("permission denied"));

    const emulator = makeEmulator(true);
    const log = sandbox.stub((emulator as any).logger, "log");

    await (emulator as any).startPython(makePythonBackend(), {});
    await emulator.stop();
    await (emulator as any).startPython(makePythonBackend(), {});

    expect(rmSync).to.have.been.calledOnceWith("/tmp/firebase-tools-python-shim-error", {
      recursive: true,
    });
    expect(mkdtempSync).to.have.been.calledTwice;
    expect(runWithVirtualEnv.secondCall.args[2].PYTHONPATH).to.equal(
      "/tmp/firebase-tools-python-shim-recreated",
    );
    expect(log).to.have.been.calledWith(
      "DEBUG",
      sinon.match("Failed to clean up python-disable-gunicorn shim dir"),
    );
  });
});
