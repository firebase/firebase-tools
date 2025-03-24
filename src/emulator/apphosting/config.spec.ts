import * as sinon from "sinon";
import { expect } from "chai";
import { getLocalAppHostingConfiguration } from "./config";
import * as configImport from "../../apphosting/config";
import { AppHostingYamlConfig } from "../../apphosting/yaml";
import { FirebaseError } from "../../error";

describe("environments", () => {
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
  const apphostingYamlSecretToPlaintext = {
    randomSecretOne: { value: "RANDOM_SECRET_ONE_PLAINTEXT" },
    randomSecretTwo: { value: "RANDOM_SECRET_TWO_PLAINTEXT" },
    randomSecretThree: { value: "RANDOM_SECRET_THREE_PLAINTEXT" },
    randomSecretFour: { value: "RANDOM_SECRET_FOUR_PLAINTEXT" },
  };

  // Configs used for stubs
  const apphostingYamlConfigOne = AppHostingYamlConfig.empty();
  apphostingYamlConfigOne.env = { ...apphostingYamlEnvOne };

  const apphostingYamlConfigTwo = AppHostingYamlConfig.empty();
  apphostingYamlConfigTwo.env = { ...apphostingYamlEnvTwo };

  const apphostingYamlConfigSecretsToPlaintext = AppHostingYamlConfig.empty();
  apphostingYamlConfigSecretsToPlaintext.env = { ...apphostingYamlSecretToPlaintext };

  beforeEach(() => {
    loadAppHostingYamlStub = sinon.stub(AppHostingYamlConfig, "loadFromFile");
    listAppHostingFilesInPathStub = sinon.stub(configImport, "listAppHostingFilesInPath");
  });

  afterEach(() => {
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
        .returns(apphostingYamlConfigSecretsToPlaintext);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(apphostingConfig.env).to.deep.equal({
        ...apphostingYamlEnvOne,
        ...apphostingYamlSecretToPlaintext,
      });
    });

    it("should allow merging all three file types", async () => {
      listAppHostingFilesInPathStub.returns([
        "/parent/cwd/apphosting.yaml",
        "/parent/cwd/apphosting.emulator.yaml",
        "/parent/apphosting.local.yaml",
      ]);

      // Second config takes precedence
      loadAppHostingYamlStub
        .withArgs("/parent/cwd/apphosting.yaml")
        .returns(apphostingYamlConfigOne);
      loadAppHostingYamlStub
        .withArgs("/parent/cwd/apphosting.emulator.yaml")
        .returns(apphostingYamlConfigTwo);
      loadAppHostingYamlStub
        .withArgs("/parent/apphosting.local.yaml")
        .returns(apphostingYamlConfigSecretsToPlaintext);

      const apphostingConfig = await getLocalAppHostingConfiguration("./");

      expect(apphostingConfig.env).to.deep.equal({
        ...apphostingYamlEnvOne,
        ...apphostingYamlEnvTwo,
        ...apphostingYamlSecretToPlaintext,
      });
    });

    it("Should not allow apphosting.emulator.yaml to convert secrets to plaintext", async () => {
      listAppHostingFilesInPathStub.returns([
        "/parent/cwd/apphosting.yaml",
        "/parent/cwd/apphosting.emulator.yaml",
      ]);

      // Second config takes precedence
      loadAppHostingYamlStub
        .withArgs("/parent/cwd/apphosting.yaml")
        .returns(apphostingYamlConfigOne);
      loadAppHostingYamlStub
        .withArgs("/parent/cwd/apphosting.emulator.yaml")
        .returns(apphostingYamlConfigSecretsToPlaintext);

      await expect(getLocalAppHostingConfiguration("./")).to.be.rejectedWith(FirebaseError);
    });
  });
});
