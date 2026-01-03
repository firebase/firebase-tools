import { expect } from "chai";
import * as _ from "lodash";
import * as sinon from "sinon";

import { Config } from "../../config";
import { askQuestions, actuate } from "./storage";
import * as prompt from "../../prompt";
import * as gcp from "../../gcp";
describe("storage", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();
  let askWriteProjectFileStub: sinon.SinonStub;
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    askWriteProjectFileStub = sandbox.stub(Config.prototype, "writeProjectFile");
    promptStub = sandbox.stub(prompt, "input");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("doSetup", () => {
    it("should set up the correct properties in the project", async () => {
      const setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "my-project-123",
        projectLocation: "us-central",
        instructions: [],
      };
      const config = new Config({}, { projectDir: "test", cwd: "test" });
      promptStub.returns("storage.rules");
      askWriteProjectFileStub.resolves();

      await askQuestions(setup, config);
      await actuate(setup, config);

      expect(_.get(setup, "config.storage.rules")).to.deep.equal("storage.rules");
    });
  });
  it("should download rules from console", async () => {
    const setup = {
      config: {},
      rcfile: { projects: {}, targets: {}, etags: {} },
      projectId: "test-project",
      instructions: [],
    };
    const config = new Config({}, { projectDir: "test", cwd: "test" });
    const getRulesetNameStub = sandbox
      .stub(gcp.rules, "getLatestRulesetName")
      .resolves("ruleset-name");
    const getRulesetContentStub = sandbox
      .stub(gcp.rules, "getRulesetContent")
      .resolves([{ name: "file.rules", content: "console rules" }]);
    const writeStub = sandbox.stub(config, "confirmWriteProjectFile").resolves(true);
    promptStub.returns("storage.rules");

    await askQuestions(setup, config);
    await actuate(setup, config);

    expect(getRulesetNameStub.calledOnceWith("test-project", "firebase.storage")).to.be.true;
    expect(getRulesetContentStub.calledOnceWith("ruleset-name")).to.be.true;
    expect(writeStub.calledOnceWith("storage.rules", "console rules")).to.be.true;
    expect(_.get(setup, "featureInfo.storage.rules")).to.equal("console rules");
  });
});
