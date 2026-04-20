import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import { askQuestions, actuate, DEFAULT_RULES } from "./database";
import * as prompt from "../../prompt";
import * as getDefaultDatabaseInstanceModule from "../../getDefaultDatabaseInstance";
import * as databaseManagement from "../../management/database";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import { Config } from "../../config";
import { FirebaseError } from "../../error";

describe("init/features/database", () => {
  let confirmStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;
  let getDefaultInstanceStub: sinon.SinonStub;
  let getDatabaseInstanceDetailsStub: sinon.SinonStub;
  let ensureStub: sinon.SinonStub;
  let configWriteStub: sinon.SinonStub;
  let configConfirmWriteStub: sinon.SinonStub;

  beforeEach(() => {
    confirmStub = sinon.stub(prompt, "confirm");
    inputStub = sinon.stub(prompt, "input");
    selectStub = sinon.stub(prompt, "select");
    getDefaultInstanceStub = sinon.stub(getDefaultDatabaseInstanceModule, "getDefaultDatabaseInstance");
    getDatabaseInstanceDetailsStub = sinon.stub(databaseManagement, "getDatabaseInstanceDetails");
    ensureStub = sinon.stub(ensureApiEnabled, "ensure").resolves();
    configWriteStub = sinon.stub(Config.prototype, "writeProjectFile");
    configConfirmWriteStub = sinon.stub(Config.prototype, "confirmWriteProjectFile");
  });

  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  describe("askQuestions", () => {
    it("should setup defaults when no project ID is present", async () => {
      inputStub.resolves("database.rules.json");
      configConfirmWriteStub.resolves(true);
      const setup: any = { config: {} };
      const config = new Config({}, {});

      await askQuestions(setup, config);

      expect(setup.featureInfo.database.rulesFilename).to.equal("database.rules.json");
      expect(setup.featureInfo.database.rules).to.equal(DEFAULT_RULES);
    });

    it("should download rules from existing instance if project ID is present", async () => {
      inputStub.resolves("database.rules.json");
      configConfirmWriteStub.resolves(true);
      getDefaultInstanceStub.resolves("my-instance");
      getDatabaseInstanceDetailsStub.resolves({
        name: "my-instance",
        databaseUrl: "https://my-instance.firebaseio.com",
      });

      const mockRules = '{ "rules": { ".read": true } }';
      nock("https://my-instance.firebaseio.com")
        .get("/.settings/rules.json")
        .reply(200, mockRules);

      const setup: any = { projectId: "my-project", config: {} };
      const config = new Config({}, {});

      await askQuestions(setup, config);

      expect(setup.featureInfo.database.rules).to.equal(mockRules);
    });

    it("should throw if rules fetch fails", async () => {
      inputStub.resolves("database.rules.json");
      getDefaultInstanceStub.resolves("my-instance");
      getDatabaseInstanceDetailsStub.resolves({
        name: "my-instance",
        databaseUrl: "https://my-instance.firebaseio.com",
      });

      nock("https://my-instance.firebaseio.com")
        .get("/.settings/rules.json")
        .reply(500);

      const setup: any = { projectId: "my-project", config: {} };
      const config = new Config({}, {});

      await expect(askQuestions(setup, config)).to.be.rejectedWith(
        FirebaseError,
        /Failed to fetch current rules/
      );
    });
  });

  describe("actuate", () => {
    it("should write rules to file if writeRules is true", async () => {
      const setup: any = {
        config: {},
        featureInfo: {
          database: {
            rulesFilename: "database.rules.json",
            rules: DEFAULT_RULES,
            writeRules: true,
          },
        },
      };
      const config = new Config({}, {});

      await actuate(setup, config);

      expect(configWriteStub).to.have.been.calledWith("database.rules.json", DEFAULT_RULES);
    });

    it("should skip writing rules if writeRules is false", async () => {
      const setup: any = {
        config: {},
        featureInfo: {
          database: {
            rulesFilename: "database.rules.json",
            rules: DEFAULT_RULES,
            writeRules: false,
          },
        },
      };
      const config = new Config({}, {});

      await actuate(setup, config);

      expect(configWriteStub).to.not.have.been.called;
    });
  });
});
