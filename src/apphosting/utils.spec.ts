import { expect } from "chai";

import * as utils from "./utils";
import * as promptImport from "../prompt";
import * as sinon from "sinon";

describe("utils", () => {
  describe("getEnvironmentName", () => {
    it("should throw an error if environment can't be found", () => {
      expect(utils.getEnvironmentName.bind(utils.getEnvironmentName, "apphosting.yaml")).to.throw(
        "Invalid apphosting environment file",
      );
    });

    it("should return the environment if valid environment specific apphosting file is given", () => {
      expect(utils.getEnvironmentName("apphosting.staging.yaml")).to.equal("staging");
    });
  });

  describe("promptForAppHostingYaml", () => {
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    beforeEach(() => {
      prompt = sinon.stub(promptImport);
    });
    afterEach(() => {
      sinon.verifyAndRestore();
    });
    it("should prompt with the correct options", async () => {
      const apphostingFileNameToPathMap = new Map<string, string>([
        ["apphosting.yaml", "/parent/cwd/apphosting.yaml"],
        ["apphosting.staging.yaml", "/parent/apphosting.staging.yaml"],
      ]);

      prompt.promptOnce.returns(Promise.resolve());

      await utils.promptForAppHostingYaml(apphostingFileNameToPathMap);

      expect(prompt.promptOnce).to.have.been.calledWith({
        name: "apphosting-yaml",
        type: "list",
        message: "Please select an App Hosting config:",
        choices: [
          {
            name: "base (apphosting.yaml)",
            value: "/parent/cwd/apphosting.yaml",
          },
          {
            name: "staging (apphosting.yaml + apphosting.staging.yaml)",
            value: "/parent/apphosting.staging.yaml",
          },
        ],
      });
    });
  });
});
