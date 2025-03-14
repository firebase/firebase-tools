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
  const apphostingYamlEnvOne = {
    randomEnvOne: { value: "ENV_ONE_FROM_CONFIG_ONE" },
    randomEnvTwo: { value: "ENV_TWO_FROM_CONFIG_ONE" },
    randomSecretOne: { secret: "SECRET_ONE_FROM_CONFIG_ONE" },
    randomSecretTwo: { secret: "SECRET_TWO_FROM_CONFIG_ONE" },
    randomSecretThree: { secret: "SECRET_THREE_FROM_CONFIG_ONE" },
  };
  const apphostingYamlEnvTwo = {
    randomEnvOne: { value: "ENV_ONE_FROM_CONFIG_TWO" },
    randomEnvTwo: { value: "ENV_TWO_FROM_CONFIG_TWO" },
    randomEnvFour: { value: "ENV_FOUR_FROM_CONFIG_TWO" },
    randomSecretOne: { secret: "SECRET_ONE_FROM_CONFIG_TWO" },
    randomSecretFour: { secret: "SECRET_FOUR_FROM_CONFIG_TWO" },
  };

  // Configs used for stubs
  const apphostingYamlConfigOne = AppHostingYamlConfig.empty();
  apphostingYamlConfigOne.env = { ...apphostingYamlEnvOne };

  const apphostingYamlConfigTwo = AppHostingYamlConfig.empty();
  apphostingYamlConfigTwo.env = { ...apphostingYamlEnvTwo };

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
      expect(apphostingConfig.env).to.deep.equal({});
    });

    it("should return local config if only local config found", async () => {
      listAppHostingFilesInPathStub.returns(["/parent/apphosting.local.yaml"]);
      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigOne);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(apphostingConfig.env).to.deep.equal(apphostingYamlEnvOne);
    });

    it("should return base config if only base config found", async () => {
      listAppHostingFilesInPathStub.returns(["/parent/apphosting.yaml"]);
      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigOne);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(apphostingConfig.env).to.deep.equal(apphostingYamlEnvOne);
    });

    it("should combine apphosting yaml files according to precedence", async () => {
      listAppHostingFilesInPathStub.returns([
        "/parent/cwd/apphosting.yaml",
        "/parent/apphosting.local.yaml",
      ]);

      // Second config takes precedence
      loadAppHostingYamlStub
        .withArgs("/parent/cwd/apphosting.yaml")
        .returns(apphostingYamlConfigOne);
      loadAppHostingYamlStub
        .withArgs("/parent/apphosting.local.yaml")
        .returns(apphostingYamlConfigTwo);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(apphostingConfig.env).to.deep.equal({
        ...apphostingYamlEnvOne,
        ...apphostingYamlEnvTwo,
      });
    });
  });
});
