import * as commandUtils from "./commandUtils";
import { expect } from "chai";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { FirebaseError } from "../error";
import { EXPORT_ON_EXIT_USAGE_ERROR, EXPORT_ON_EXIT_CWD_DANGER } from "./commandUtils";
import * as fsutils from "../fsutils";
import * as path from "path";
import * as sinon from "sinon";
import * as utils from "../utils";

describe("commandUtils", () => {
  const testSetExportOnExitOptions = (options: any): any => {
    commandUtils.setExportOnExitOptions(options);
    return options;
  };

  describe("Mocked path resolve", () => {
    const mockCWD = "/a/resolved/path/example";
    const mockDestinationDir = "/path/example";

    let pathStub: sinon.SinonStub;
    beforeEach(() => {
      pathStub = sinon.stub(path, "resolve").callsFake((path) => {
        return path === "." ? mockCWD : mockDestinationDir;
      });
    });

    afterEach(() => {
      pathStub.restore();
    });

    it("Should not block if destination contains a match to the CWD", () => {
      const directoryToAllow = mockDestinationDir;
      expect(testSetExportOnExitOptions({ exportOnExit: directoryToAllow }).exportOnExit).to.equal(
        directoryToAllow,
      );
    });
  });

  /**
   * Currently, setting the --export-on-exit as the current CWD can inflict on
   * full directory deletion
   */
  const directoriesThatShouldFail = [
    ".", // The current dir
    "./", // The current dir with /
    path.resolve("."), // An absolute path
    path.resolve(".."), // A folder that directs to the CWD
    path.resolve("../.."), // Another folder that directs to the CWD
  ];

  directoriesThatShouldFail.forEach((dir) => {
    it(`Should disallow the user to set the current folder (ex: ${dir}) as --export-on-exit option`, () => {
      expect(() => testSetExportOnExitOptions({ exportOnExit: dir })).to.throw(
        EXPORT_ON_EXIT_CWD_DANGER,
      );
      const cwdSubDir = path.join(dir, "some-dir");
      expect(testSetExportOnExitOptions({ exportOnExit: cwdSubDir }).exportOnExit).to.equal(
        cwdSubDir,
      );
    });
  });

  it("Should disallow the user to set the current folder via the --import flag", () => {
    expect(() => testSetExportOnExitOptions({ import: ".", exportOnExit: true })).to.throw(
      EXPORT_ON_EXIT_CWD_DANGER,
    );
    const cwdSubDir = path.join(".", "some-dir");
    expect(
      testSetExportOnExitOptions({ import: cwdSubDir, exportOnExit: true }).exportOnExit,
    ).to.equal(cwdSubDir);
  });

  it("should validate --export-on-exit options", () => {
    expect(testSetExportOnExitOptions({ import: "./data" }).exportOnExit).to.be.undefined;
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: "./data" }).exportOnExit,
    ).to.eql("./data");
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: "./dataExport" }).exportOnExit,
    ).to.eql("./dataExport");
    expect(
      testSetExportOnExitOptions({ import: "./data", exportOnExit: true }).exportOnExit,
    ).to.eql("./data");
    expect(() => testSetExportOnExitOptions({ exportOnExit: true })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
    expect(() => testSetExportOnExitOptions({ import: "", exportOnExit: true })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
    expect(() => testSetExportOnExitOptions({ import: "", exportOnExit: "" })).to.throw(
      FirebaseError,
      EXPORT_ON_EXIT_USAGE_ERROR,
    );
  });
  it("should delete the --import option when the dir does not exist together with --export-on-exit", () => {
    expect(
      testSetExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
        exportOnExit: "./dataDirThatDoesNotExist",
      }).import,
    ).to.be.undefined;
    const options = testSetExportOnExitOptions({
      import: "./dataDirThatDoesNotExist",
      exportOnExit: true,
    });
    expect(options.import).to.be.undefined;
    expect(options.exportOnExit).to.eql("./dataDirThatDoesNotExist");
  });
  it("should not touch the --import option when the dir does not exist but --export-on-exit is not set", () => {
    expect(
      testSetExportOnExitOptions({
        import: "./dataDirThatDoesNotExist",
      }).import,
    ).to.eql("./dataDirThatDoesNotExist");
  });
  it("should keep other unrelated options when using setExportOnExitOptions", () => {
    expect(
      testSetExportOnExitOptions({
        someUnrelatedOption: "isHere",
      }).someUnrelatedOption,
    ).to.eql("isHere");
  });

  describe("checkJavaMajorVersion and getJavaBinary", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      commandUtils.resetJavaBinaryForTesting();
    });

    afterEach(() => {
      commandUtils.resetJavaBinaryForTesting();
      sandbox.restore();
    });

    it("should parse Java major version and resolve java binary from PATH java.home on Windows even if JAVA_HOME differs", async () => {
      sandbox.stub(utils, "IS_WINDOWS").value(true);
      sandbox.stub(process, "env").value({
        ...process.env,
        JAVA_HOME: "C:\\Program Files\\Java\\jdk-17",
      });
      const expectedJavaBin = path.join("C:\\Program Files\\Java\\jdk-21", "bin", "java.exe");
      sandbox.stub(fsutils, "fileExistsSync").callsFake((p: string) => p === expectedJavaBin);

      const fakeChild = new EventEmitter() as childProcess.ChildProcess;
      fakeChild.stdout = new PassThrough();
      fakeChild.stderr = new PassThrough();

      const spawnStub = sandbox.stub(childProcess, "spawn").callsFake(() => {
        process.nextTick(() => {
          fakeChild.stderr?.emit(
            "data",
            Buffer.from(
              [
                "Property settings:",
                "    java.home = C:\\Program Files\\Java\\jdk-21",
                'openjdk version "21.0.2" 2024-01-16',
              ].join("\n"),
            ),
          );
          fakeChild.emit("exit", 0, null);
        });
        return fakeChild;
      });

      const version = await commandUtils.checkJavaMajorVersion();

      expect(version).to.equal(21);
      expect(commandUtils.getJavaBinary()).to.equal(expectedJavaBin);
      expect(spawnStub.calledOnce).to.be.true;
      expect(spawnStub.firstCall.args[0]).to.equal("java");
      expect(spawnStub.firstCall.args[1]).to.include("-Dstderr.encoding=UTF-8");
      expect(spawnStub.firstCall.args[1]).to.include("-XshowSettings:properties");
      expect(spawnStub.firstCall.args[2]).to.deep.include({
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    });

    it("should keep getJavaBinary() as 'java' on POSIX and not pass -XshowSettings:properties", async () => {
      sandbox.stub(utils, "IS_WINDOWS").value(false);
      sandbox.stub(process, "env").value({
        ...process.env,
        JAVA_HOME: "/opt/jdk-17",
      });
      sandbox.stub(fsutils, "fileExistsSync").returns(true);

      const fakeChild = new EventEmitter() as childProcess.ChildProcess;
      fakeChild.stdout = new PassThrough();
      fakeChild.stderr = new PassThrough();

      const spawnStub = sandbox.stub(childProcess, "spawn").callsFake(() => {
        process.nextTick(() => {
          fakeChild.stderr?.emit("data", Buffer.from('openjdk version "21.0.2" 2024-01-16\n'));
          fakeChild.emit("exit", 0, null);
        });
        return fakeChild;
      });

      const version = await commandUtils.checkJavaMajorVersion();

      expect(version).to.equal(21);
      expect(commandUtils.getJavaBinary()).to.equal("java");
      expect(spawnStub.firstCall.args[0]).to.equal("java");
      expect(spawnStub.firstCall.args[1]).to.not.include("-XshowSettings:properties");
    });

    it("should strip quotes and fall back to JAVA_HOME/bin/java.exe on Windows when resolvedJavaBinary is not cached", () => {
      sandbox.stub(utils, "IS_WINDOWS").value(true);
      sandbox.stub(process, "env").value({
        ...process.env,
        JAVA_HOME: '"C:\\Program Files\\Java\\jdk-21"',
      });
      const expectedJavaBin = path.join("C:\\Program Files\\Java\\jdk-21", "bin", "java.exe");
      sandbox.stub(fsutils, "fileExistsSync").callsFake((p: string) => p === expectedJavaBin);

      expect(commandUtils.getJavaBinary()).to.equal(expectedJavaBin);
    });
  });
});
