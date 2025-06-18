import { expect } from "chai";
import * as init from "./index";
import * as sinon from "sinon";
import * as prompt from "../../../prompt";
import { Setup } from "../..";
import { Config } from "../../../config";

describe("init apptesting", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("askQuestions", () => {
    it("populates apptesting featureInfo", async () => {
      const inputStub = sinon.stub(prompt, "input");
      inputStub.withArgs(sinon.match.has("default", "tests")).returns(Promise.resolve("tests"));
      const setup: Setup = { featureInfo: {} } as Setup;

      await init.askQuestions(setup);

      expect(setup.featureInfo).to.eql({ apptesting: { testDir: "tests" } });
    });
  });

  describe("actuate", () => {
    it("writes a sample smoke test", async () => {
      const setup: Setup = { featureInfo: { apptesting: { testDir: "my_test_dir" } } } as Setup;
      const config = new Config({});
      const askWriteProjectFileStub = sinon.stub(config, "askWriteProjectFile");
      askWriteProjectFileStub.returns(Promise.resolve());

      await init.actuate(setup, config);

      sinon.assert.calledWith(
        askWriteProjectFileStub,
        "my_test_dir/smoke_test.yaml",
        sinon.match.string,
      );
      expect(config.get("apptesting.testDir")).to.eql("my_test_dir");
    });
  });
});
