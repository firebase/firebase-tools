import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { Config } from "../../../config";
import { askQuestions, actuate } from "./index";
import * as prompt from "../../../prompt";
import * as rules from "./rules";

describe("storage", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let writeProjectFileStub: sinon.SinonStub;
  let confirmWriteProjectFileStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;
  let getRulesFromConsoleStub: sinon.SinonStub;

  beforeEach(() => {
    writeProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
    confirmWriteProjectFileStub = sandbox.stub(Config.prototype, "confirmWriteProjectFile");
    promptStub = sandbox.stub(prompt, "input");
    getRulesFromConsoleStub = sandbox.stub(rules, "getRulesFromConsole");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("askQuestions", () => {
    it("should set up the correct properties in the project", async () => {
      const setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "demo-project",
        projectLocation: "us-central",
        instructions: [],
      };
      const config = new Config({}, { projectDir: "test", cwd: "test" });
      promptStub.returns("storage.rules");
      confirmWriteProjectFileStub.resolves(true);
      getRulesFromConsoleStub.resolves(null);

      await askQuestions(setup, config);
      await actuate(setup, config);

      expect(_.get(setup, "config.storage.rules")).to.deep.equal("storage.rules");
      expect(writeProjectFileStub).to.have.been.calledWith("storage.rules", sinon.match.string);
    });

    it("should use downloaded rules if available", async () => {
      const setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "demo-project",
        projectLocation: "us-central",
        instructions: [],
      };
      const config = new Config({}, { projectDir: "test", cwd: "test" });
      promptStub.returns("storage.rules");
      confirmWriteProjectFileStub.resolves(true);
      const existingRules =
        "service firebase.storage { match /b/{bucket}/o { match /{allPaths=**} { allow read, write: if request.auth != null; } } }";
      getRulesFromConsoleStub.resolves(existingRules);

      await askQuestions(setup, config);
      await actuate(setup, config);

      expect(_.get(setup, "config.storage.rules")).to.deep.equal("storage.rules");
      expect(writeProjectFileStub).to.have.been.calledWith("storage.rules", existingRules);
    });
  });
});
