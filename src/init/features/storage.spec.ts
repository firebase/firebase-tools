import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";
import * as tmp from "tmp";
import { rmSync } from "node:fs";

import { Config } from "../../config";
import { askQuestions, actuate } from "./storage";
import * as prompt from "../../prompt";

describe("storage", () => {
  const tempdir = tmp.dirSync();
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let askWriteProjectFileStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    askWriteProjectFileStub = sandbox.stub(Config.prototype, "askWriteProjectFile");
    promptStub = sandbox.stub(prompt, "input");
  });

  afterEach(() => {
    sandbox.restore();
    rmSync(tempdir.name, { recursive: true });
  });

  describe("doSetup", () => {
    it("should set up the correct properties in the project", async () => {
      const setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "my-project-123",
        projectLocation: "us-central",
      };
      const config = new Config({}, { projectDir: tempdir.name, cwd: tempdir.name });
      promptStub.returns("storage.rules");
      askWriteProjectFileStub.resolves();

      await askQuestions(setup, config);
      await actuate(setup, config);

      expect(_.get(setup, "config.storage.rules")).to.deep.equal("storage.rules");
    });
  });
});
