import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import * as python from ".";

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

  describe("getExpectedPythonVersion", () => {
    it("extracts the major.minor version encoded in the runtime name", () => {
      expect(python.getExpectedPythonVersion("python310")).to.equal("3.10");
      expect(python.getExpectedPythonVersion("python312")).to.equal("3.12");
    });
  });

  describe("getVenvPythonVersion", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-python-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("reads the version from pyvenv.cfg", () => {
      fs.mkdirSync(path.join(tmpDir, "venv"));
      fs.writeFileSync(
        path.join(tmpDir, "venv", "pyvenv.cfg"),
        "home = /usr/bin\nversion = 3.10.12\nexecutable = /usr/bin/python3.10\n",
      );

      expect(python.getVenvPythonVersion(tmpDir, "venv")).to.equal("3.10");
    });

    it("reads version_info when version is absent", () => {
      fs.mkdirSync(path.join(tmpDir, "venv"));
      fs.writeFileSync(
        path.join(tmpDir, "venv", "pyvenv.cfg"),
        "home = /usr/bin\nversion_info = 3.12.1.final.0\n",
      );

      expect(python.getVenvPythonVersion(tmpDir, "venv")).to.equal("3.12");
    });

    it("returns undefined when there is no venv", () => {
      expect(python.getVenvPythonVersion(tmpDir, "venv")).to.be.undefined;
    });
  });

  describe("buildVersionMismatchMessage", () => {
    it("suggests recreating the venv with a versioned python binary by default", () => {
      const message = python.buildVersionMismatchMessage("python312", "3.10", "3.12", "darwin");

      expect(message).to.match(
        /Python version mismatch.*Python 3\.10.*Python 3\.12.*runtime "python312"/s,
      );
      expect(message).to.include("python3.12 -m venv venv");
      expect(message).to.include('"runtime": "python310"');
    });

    it("suggests the py launcher to recreate the venv on windows", () => {
      const message = python.buildVersionMismatchMessage("python312", "3.10", "3.12", "win32");

      expect(message).to.include("py -3.12 -m venv venv");
    });

    it("omits the runtime suggestion when the venv's python version isn't a supported runtime", () => {
      const message = python.buildVersionMismatchMessage("python312", "3.9", "3.12", "darwin");

      expect(message).to.match(/Python version mismatch.*Python 3\.9.*Python 3\.12/s);
      expect(message).not.to.include('"runtime": "python39"');
    });
  });

  describe("modulesDir version mismatch", () => {
    let tmpDir: string;
    let platformMock: sinon.SinonStub;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-python-test-"));
      platformMock = sinon.stub(process, "platform").value("darwin");
    });

    afterEach(() => {
      platformMock.restore();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("throws a clear error when the venv's python version doesn't match the runtime", async () => {
      fs.mkdirSync(path.join(tmpDir, "venv"));
      fs.writeFileSync(
        path.join(tmpDir, "venv", "pyvenv.cfg"),
        "home = /usr/bin\nversion = 3.10.12\nexecutable = /usr/bin/python3.10\n",
      );

      const delegate = new python.Delegate(PROJECT_ID, tmpDir, "python312");

      await expect(delegate.modulesDir()).to.eventually.be.rejectedWith(
        /Python version mismatch.*Python 3\.10.*Python 3\.12.*runtime "python312"/s,
      );
    });
  });
});
