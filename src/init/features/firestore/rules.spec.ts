import { expect } from "chai";
import * as sinon from "sinon";
import * as gcp from "../../../gcp";
import * as prompt from "../../../prompt";
import * as config from "../../../config";
import { initRules, getDefaultRules } from "./rules";
import { Setup } from "../..";

describe("firestore rules", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getDefaultRules", () => {
    it("should return the default rules with the correct date", () => {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      const expectedDate = `${date.getFullYear()}, ${date.getMonth() + 1}, ${date.getDate()}`;
      const rules = getDefaultRules();
      expect(rules).to.include(
        `allow read, write: if request.time < timestamp.date(${expectedDate});`,
      );
    });
  });

  describe("initRules", () => {
    it("should prompt for rules file and write default rules", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      sandbox.stub(prompt, "input").resolves("firestore.rules");
      sandbox.stub(cfg, "writeProjectFile");
      const confirmStub = sandbox.stub(cfg, "confirmWriteProjectFile").resolves(true);

      await initRules(setup, cfg, {
        rulesFilename: "",
        rules: "",
        writeRules: false,
        databaseId: "",
        locationId: "",
        indexesFilename: "",
        indexes: "",
        writeIndexes: false,
      });

      expect(confirmStub.calledOnceWith("firestore.rules", getDefaultRules())).to.be.true;
    });

    it("should download rules from console", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const getRulesetNameStub = sandbox
        .stub(gcp.rules, "getLatestRulesetName")
        .resolves("ruleset-name");
      const getRulesetContentStub = sandbox
        .stub(gcp.rules, "getRulesetContent")
        .resolves([{ name: "file.rules", content: "console rules" }]);
      const writeStub = sandbox.stub(cfg, "confirmWriteProjectFile").resolves(true);

      const info = {
        rulesFilename: "firestore.rules",
        rules: "",
        writeRules: false,
        databaseId: "(default)",
        locationId: "",
        indexesFilename: "",
        indexes: "",
        writeIndexes: false,
      };
      await initRules(setup, cfg, info);

      expect(getRulesetNameStub.calledOnceWith("test-project", "cloud.firestore", undefined)).to.be
        .true;
      expect(getRulesetContentStub.calledOnceWith("ruleset-name")).to.be.true;
      expect(writeStub.calledOnceWith("firestore.rules", "console rules")).to.be.true;
      expect(info.rules).to.equal("console rules");
    });

    it("should download rules from console for named database", async () => {
      const setup: Setup = {
        config: {},
        rcfile: { projects: {}, targets: {}, etags: {} },
        projectId: "test-project",
        instructions: [],
      };
      const cfg = new config.Config({}, { projectDir: "/", cwd: "/" });
      const getRulesetNameStub = sandbox
        .stub(gcp.rules, "getLatestRulesetName")
        .resolves("ruleset-name");
      const getRulesetContentStub = sandbox
        .stub(gcp.rules, "getRulesetContent")
        .resolves([{ name: "file.rules", content: "console rules" }]);
      const writeStub = sandbox.stub(cfg, "confirmWriteProjectFile").resolves(true);

      const info = {
        rulesFilename: "firestore.rules",
        rules: "",
        writeRules: false,
        databaseId: "named-datbase",
        locationId: "",
        indexesFilename: "",
        indexes: "",
        writeIndexes: false,
      };
      await initRules(setup, cfg, info);

      expect(getRulesetNameStub.calledOnceWith("test-project", "cloud.firestore", "named-datbase"))
        .to.be.true;
      expect(getRulesetContentStub.calledOnceWith("ruleset-name")).to.be.true;
      expect(writeStub.calledOnceWith("firestore.rules", "console rules")).to.be.true;
      expect(info.rules).to.equal("console rules");
    });
  });
});
