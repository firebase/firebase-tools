import { expect } from "chai";
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
});
