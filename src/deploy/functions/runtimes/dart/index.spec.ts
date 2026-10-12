import { expect } from "chai";
import * as sinon from "sinon";
import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EventEmitter } from "events";
import { ChildProcess } from "child_process";
import { Delegate, DART_ENTRY_POINT } from "./index";
import * as discovery from "../discovery";
import * as build from "../../build";
import * as supported from "../supported";
import { FirebaseError } from "../../../../error";
import { EmulatorRegistry } from "../../../../emulator/registry";
import { Emulators } from "../../../../emulator/types";

function createFakeChildProcess(exitCode: number | null): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  (proc as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (proc as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  process.nextTick(() => proc.emit("exit", exitCode));
  return proc;
}

function writePackageConfig(sourceDir: string, languageVersion: string): void {
  fs.mkdirSync(path.join(sourceDir, ".dart_tool"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, ".dart_tool", "package_config.json"),
    JSON.stringify({
      configVersion: 2,
      packages: [{ name: "my_function", rootUri: "../", packageUri: "lib/", languageVersion }],
    }),
  );
}

describe("Dart Runtime Delegate", () => {
  describe("validate", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-delegate-validate-"));
      fs.writeFileSync(path.join(tmpDir, "pubspec.yaml"), "name: my_function\n");
      fs.mkdirSync(path.join(tmpDir, "bin"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "bin", "server.dart"), "void main() {}\n");
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should reject a Dart SDK older than 3.9.0 by default", async () => {
      writePackageConfig(tmpDir, "3.9");
      sinon.stub(childProcess, "spawnSync").returns({
        stdout: 'Dart SDK version: 3.8.0 (stable) (Thu Jan 1 2026) on "linux_x64"',
        stderr: "",
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const delegate = new Delegate("project", tmpDir, supported.latest("dart"));

      await expect(delegate.validate()).to.be.rejectedWith(
        FirebaseError,
        /Dart SDK version 3\.8\.0 is not supported.*requires Dart 3\.9\.0 or later/,
      );
    });

    it("should reject a Dart SDK older than 3.13.0 when the project declares native assets support", async () => {
      writePackageConfig(tmpDir, "3.13");
      sinon.stub(childProcess, "spawnSync").returns({
        stdout: 'Dart SDK version: 3.9.0 (stable) (Thu Jan 1 2026) on "linux_x64"',
        stderr: "",
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as unknown as ReturnType<typeof childProcess.spawnSync>);

      const delegate = new Delegate("project", tmpDir, supported.latest("dart"));

      await expect(delegate.validate()).to.be.rejectedWith(
        FirebaseError,
        /Dart SDK version 3\.9\.0 is not supported.*requires Dart 3\.13\.0 or later/,
      );
    });
  });

  describe("build", () => {
    let tmpDir: string;
    let spawnStub: sinon.SinonStub;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dart-delegate-build-"));
      spawnStub = sinon.stub(childProcess, "spawn");
    });

    afterEach(() => {
      sinon.restore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should invoke `dart compile exe` with the target/os/arch flags by default", async () => {
      spawnStub.callsFake(() => createFakeChildProcess(0));

      const delegate = new Delegate("project", tmpDir, supported.latest("dart"));
      await delegate.build();

      expect(spawnStub.callCount).to.equal(2);
      const [command, args] = spawnStub.secondCall.args as [string, string[]];
      expect(command).to.equal("dart");
      expect(args).to.deep.equal([
        "compile",
        "exe",
        DART_ENTRY_POINT,
        "-o",
        "bin/server",
        "--target-os=linux",
        "--target-arch=x64",
      ]);
    });

    it("should throw a FirebaseError with the dart compile exe remediation command on failure", async () => {
      spawnStub.onFirstCall().callsFake(() => createFakeChildProcess(0));
      spawnStub.onSecondCall().callsFake(() => createFakeChildProcess(1));

      const delegate = new Delegate("project", tmpDir, supported.latest("dart"));

      await expect(delegate.build()).to.be.rejectedWith(
        FirebaseError,
        /dart compile exe bin\/server\.dart --target-os=linux --target-arch=x64/,
      );
    });

    it("should skip compilation when the functions emulator is running", async () => {
      spawnStub.callsFake(() => createFakeChildProcess(0));
      sinon.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);

      const delegate = new Delegate("project", tmpDir, supported.latest("dart"));
      await delegate.build();

      // Only build_runner should have been spawned; compilation is skipped.
      expect(spawnStub.callCount).to.equal(1);
    });

    describe("when the project's declared language version supports native assets", () => {
      beforeEach(() => {
        writePackageConfig(tmpDir, "3.13");
      });

      it("should invoke `dart build cli` with the target/os/arch flags", async () => {
        spawnStub.callsFake(() => createFakeChildProcess(0));

        const delegate = new Delegate("project", tmpDir, supported.latest("dart"));
        await delegate.build();

        expect(spawnStub.callCount).to.equal(2);
        const [command, args] = spawnStub.secondCall.args as [string, string[]];
        expect(command).to.equal("dart");
        expect(args).to.deep.equal([
          "build",
          "cli",
          "--target",
          DART_ENTRY_POINT,
          "--target-os",
          "linux",
          "--target-arch",
          "x64",
        ]);
      });

      it("should throw a FirebaseError with the dart build cli remediation command on failure", async () => {
        spawnStub.onFirstCall().callsFake(() => createFakeChildProcess(0));
        spawnStub.onSecondCall().callsFake(() => createFakeChildProcess(1));

        const delegate = new Delegate("project", tmpDir, supported.latest("dart"));

        await expect(delegate.build()).to.be.rejectedWith(
          FirebaseError,
          /dart build cli --target bin\/server\.dart --target-os linux --target-arch x64/,
        );
      });

      it("should skip `dart build cli` when the functions emulator is running", async () => {
        spawnStub.callsFake(() => createFakeChildProcess(0));
        sinon.stub(EmulatorRegistry, "isRunning").withArgs(Emulators.FUNCTIONS).returns(true);

        const delegate = new Delegate("project", tmpDir, supported.latest("dart"));
        await delegate.build();

        // Only build_runner should have been spawned; `dart build cli` is skipped.
        expect(spawnStub.callCount).to.equal(1);
      });
    });
  });

  describe("discoverBuild", () => {
    let detectFromYamlStub: sinon.SinonStub;

    beforeEach(() => {
      detectFromYamlStub = sinon.stub(discovery, "detectFromYaml");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should not set default timeout", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, {});

      expect(result.endpoints.func1.timeoutSeconds).to.be.undefined;
      expect(result.endpoints.func1.platform).to.equal("run");
    });

    it("should preserve user-defined timeout", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
            timeoutSeconds: 120,
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, {});

      expect(result.endpoints.func1.timeoutSeconds).to.equal(120);
      expect(result.endpoints.func1.platform).to.equal("run");
    });

    it("should not apply default timeout in emulator mode", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, { FUNCTIONS_EMULATOR: "true" });

      expect(result.endpoints.func1.timeoutSeconds).to.be.undefined;
      // Platform should not be converted to "run" in emulator mode either
      expect(result.endpoints.func1.platform).to.equal("gcfv2");
    });
  });
});
