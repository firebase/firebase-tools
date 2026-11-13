import { expect } from "chai";
import * as sinon from "sinon";
import * as childProcess from "child_process";
import * as portfinder from "portfinder";
import { EventEmitter } from "events";
import { ChildProcess } from "child_process";
import { FunctionsEmulator, EmulatableBackend } from "./functionsEmulator";
import { DART_ENTRY_POINT } from "../deploy/functions/runtimes/dart";

function createFakeChildProcess(): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  return proc;
}

describe("FunctionsEmulator", () => {
  describe("startDart", () => {
    const backend: EmulatableBackend = {
      functionsDir: "/tmp/functions",
      env: {},
      secretEnv: [],
      codebase: "default",
      runtime: "dart3",
    };
    let spawnStub: sinon.SinonStub;
    let emulator: FunctionsEmulator;

    beforeEach(() => {
      spawnStub = sinon.stub(childProcess, "spawn").callsFake(() => createFakeChildProcess());
      sinon.stub(portfinder, "getPortPromise").resolves(8081);
      emulator = new FunctionsEmulator({
        projectId: "project",
        projectDir: "/tmp",
        emulatableBackends: [backend],
        debugPort: false,
      });
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should pass user envs as defines before the entry point", async () => {
      sinon.stub(emulator, "getUserEnvs").returns({ FOO: "bar", LIST: "a,b" });

      await emulator.startDart(backend, {});

      const [command, args] = spawnStub.firstCall.args as [string, string[]];
      expect(command).to.equal("dart");
      expect(args).to.deep.equal([
        "run",
        "--no-serve-devtools",
        "--define=FOO=bar",
        DART_ENTRY_POINT,
      ]);
    });

    it("should not pass defines when there are no user envs", async () => {
      sinon.stub(emulator, "getUserEnvs").returns({});

      await emulator.startDart(backend, {});

      const [, args] = spawnStub.firstCall.args as [string, string[]];
      expect(args).to.deep.equal(["run", "--no-serve-devtools", DART_ENTRY_POINT]);
    });
  });
});
