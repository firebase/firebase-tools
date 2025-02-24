import * as path from "path";
import * as utils from "./developmentServer";

import * as sinon from "sinon";
import { expect } from "chai";
import { getLocalAppHostingConfiguration } from "./config";
import * as configImport from "../../apphosting/config";
import { AppHostingYamlConfig } from "../../apphosting/yaml";

describe("environments", () => {
  let joinStub: sinon.SinonStub;
  let loggerStub: sinon.SinonStub;
  let loadAppHostingYamlStub: sinon.SinonStub;
  let listAppHostingFilesInPathStub: sinon.SinonStub;

  // Configs used for stubs
  const apphostingYamlConfigOne = AppHostingYamlConfig.empty();
  apphostingYamlConfigOne.addEnvironmentVariable({
    variable: "randomEnvOne",
    value: "ENV_ONE_FROM_CONFIG_ONE",
  });
  apphostingYamlConfigOne.addEnvironmentVariable({
    variable: "randomEnvTwo",
    value: "ENV_TWO_FROM_CONFIG_ONE",
  });
  apphostingYamlConfigOne.addEnvironmentVariable({
    variable: "randomEnvThree",
    value: "ENV_THREE_FROM_CONFIG_ONE",
  });
  apphostingYamlConfigOne.addSecret({
    variable: "randomSecretOne",
    secret: "SECRET_ONE_FROM_CONFIG_ONE",
  });
  apphostingYamlConfigOne.addSecret({
    variable: "randomSecretTwo",
    secret: "SECRET_TWO_FROM_CONFIG_ONE",
  });
  apphostingYamlConfigOne.addSecret({
    variable: "randomSecretThree",
    secret: "SECRET_THREE_FROM_CONFIG_ONE",
  });

  const apphostingYamlConfigTwo = AppHostingYamlConfig.empty();
  apphostingYamlConfigTwo.addEnvironmentVariable({
    variable: "randomEnvOne",
    value: "ENV_ONE_FROM_CONFIG_TWO",
  });
  apphostingYamlConfigTwo.addEnvironmentVariable({
    variable: "randomEnvTwo",
    value: "ENV_TWO_FROM_CONFIG_TWO",
  });
  apphostingYamlConfigTwo.addEnvironmentVariable({
    variable: "randomEnvFour",
    value: "ENV_FOUR_FROM_CONFIG_TWO",
  });
  apphostingYamlConfigTwo.addSecret({
    variable: "randomSecretOne",
    secret: "SECRET_ONE_FROM_CONFIG_TWO",
  });
  apphostingYamlConfigTwo.addSecret({
    variable: "randomSecretTwo",
    secret: "SECRET_TWO_FROM_CONFIG_TWO",
  });
  apphostingYamlConfigTwo.addSecret({
    variable: "randomSecretFour",
    secret: "SECRET_FOUR_FROM_CONFIG_TWO",
  });

  beforeEach(() => {
    loadAppHostingYamlStub = sinon.stub(AppHostingYamlConfig, "loadFromFile");
    joinStub = sinon.stub(path, "join");
    loggerStub = sinon.stub(utils, "logger");
    listAppHostingFilesInPathStub = sinon.stub(configImport, "listAppHostingFilesInPath");
  });

  afterEach(() => {
    joinStub.restore();
    loggerStub.restore();
    sinon.verifyAndRestore();
  });

  describe("getLocalAppHostingConfiguration", () => {
    it("should return an empty config if no base or local apphosting yaml files found", async () => {
      listAppHostingFilesInPathStub.returns([]);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");
      expect(JSON.stringify(apphostingConfig.environmentVariables)).to.equal(JSON.stringify([]));
      expect(JSON.stringify(apphostingConfig.secrets)).to.equal(JSON.stringify([]));
    });

    it("should return local config if only local config found", async () => {
      listAppHostingFilesInPathStub.returns(["/parent/apphosting.local.yaml"]);
      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigOne);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(JSON.stringify(apphostingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "randomEnvOne", value: "ENV_ONE_FROM_CONFIG_ONE" },
          { variable: "randomEnvTwo", value: "ENV_TWO_FROM_CONFIG_ONE" },
          { variable: "randomEnvThree", value: "ENV_THREE_FROM_CONFIG_ONE" },
        ]),
      );

      expect(JSON.stringify(apphostingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "randomSecretOne", secret: "SECRET_ONE_FROM_CONFIG_ONE" },
          { variable: "randomSecretTwo", secret: "SECRET_TWO_FROM_CONFIG_ONE" },
          { variable: "randomSecretThree", secret: "SECRET_THREE_FROM_CONFIG_ONE" },
        ]),
      );
    });

    it("should return base config if only base config found", async () => {
      listAppHostingFilesInPathStub.returns(["/parent/apphosting.yaml"]);
      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigOne);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(JSON.stringify(apphostingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "randomEnvOne", value: "ENV_ONE_FROM_CONFIG_ONE" },
          { variable: "randomEnvTwo", value: "ENV_TWO_FROM_CONFIG_ONE" },
          { variable: "randomEnvThree", value: "ENV_THREE_FROM_CONFIG_ONE" },
        ]),
      );

      expect(JSON.stringify(apphostingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "randomSecretOne", secret: "SECRET_ONE_FROM_CONFIG_ONE" },
          { variable: "randomSecretTwo", secret: "SECRET_TWO_FROM_CONFIG_ONE" },
          { variable: "randomSecretThree", secret: "SECRET_THREE_FROM_CONFIG_ONE" },
        ]),
      );
    });

    it("should combine apphosting yaml files according to precedence", async () => {
      listAppHostingFilesInPathStub.returns([
        "/parent/cwd/apphosting.yaml",
        "/parent/apphosting.local.yaml",
      ]);

      // Second config takes precedence
      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigTwo);
      loadAppHostingYamlStub.onSecondCall().returns(apphostingYamlConfigOne);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(JSON.stringify(apphostingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "randomEnvOne", value: "ENV_ONE_FROM_CONFIG_TWO" },
          { variable: "randomEnvTwo", value: "ENV_TWO_FROM_CONFIG_TWO" },
          { variable: "randomEnvThree", value: "ENV_THREE_FROM_CONFIG_ONE" },
          { variable: "randomEnvFour", value: "ENV_FOUR_FROM_CONFIG_TWO" },
        ]),
      );

      expect(JSON.stringify(apphostingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "randomSecretOne", secret: "SECRET_ONE_FROM_CONFIG_TWO" },
          { variable: "randomSecretTwo", secret: "SECRET_TWO_FROM_CONFIG_TWO" },
          { variable: "randomSecretThree", secret: "SECRET_THREE_FROM_CONFIG_ONE" },
          { variable: "randomSecretFour", secret: "SECRET_FOUR_FROM_CONFIG_TWO" },
        ]),
      );
    });
  });
});
