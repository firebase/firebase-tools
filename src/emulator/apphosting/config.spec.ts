import * as fsExtra from "fs-extra";
import * as path from "path";
import * as utils from "./utils";

import * as sinon from "sinon";
import { expect } from "chai";
import { getLocalAppHostingConfiguration } from "./config";
import * as apphostingYaml from "../../apphosting/yaml";

describe("environments", () => {
  let pathExistsStub: sinon.SinonStub;
  let joinStub: sinon.SinonStub;
  let loggerStub: sinon.SinonStub;
  let loadAppHostingYamlStub: sinon.SinonStub;

  beforeEach(() => {
    pathExistsStub = sinon.stub(fsExtra, "pathExists");
    joinStub = sinon.stub(path, "join");
    loggerStub = sinon.stub(utils, "logger");
    loadAppHostingYamlStub = sinon.stub(apphostingYaml, "loadAppHostingYaml");
  });

  afterEach(() => {
    pathExistsStub.restore();
    joinStub.restore();
    loggerStub.restore();
  });

  describe("getLocalAppHostingConfiguration", () => {
    it("should combine apphosting yaml files according to precedence", async () => {
      pathExistsStub.returns(true);

      // Second config takes precedence
      const apphostingYamlConfigTwo = new apphostingYaml.AppHostingYamlConfig();
      const apphostingYamlConfigThree = new apphostingYaml.AppHostingYamlConfig();

      apphostingYamlConfigTwo.addEnvironmentVariable({
        variable: "randomEnvOne",
        value: "envOne",
      });
      apphostingYamlConfigTwo.addEnvironmentVariable({
        variable: "randomEnvTwo",
        value: "envTwo",
      });
      apphostingYamlConfigTwo.addEnvironmentVariable({
        variable: "randomEnvThree",
        value: "envThree",
      });

      apphostingYamlConfigTwo.addSecret({ variable: "randomSecretOne", secret: "secretOne" });
      apphostingYamlConfigTwo.addSecret({ variable: "randomSecretTwo", secret: "secretTwo" });
      apphostingYamlConfigTwo.addSecret({ variable: "randomSecretThree", secret: "secretThree" });

      apphostingYamlConfigThree.addEnvironmentVariable({
        variable: "randomEnvOne",
        value: "envOne",
      });
      apphostingYamlConfigThree.addEnvironmentVariable({
        variable: "randomEnvTwo",
        value: "blah",
      });
      apphostingYamlConfigThree.addEnvironmentVariable({
        variable: "randomEnvFour",
        value: "envFour",
      });

      apphostingYamlConfigThree.addSecret({ variable: "randomSecretOne", secret: "bleh" });
      apphostingYamlConfigThree.addSecret({ variable: "randomSecretTwo", secret: "secretTwo" });
      apphostingYamlConfigThree.addSecret({ variable: "randomSecretFour", secret: "secretFour" });

      loadAppHostingYamlStub.onFirstCall().returns(apphostingYamlConfigTwo);
      loadAppHostingYamlStub.onSecondCall().returns(apphostingYamlConfigThree);

      const apphostingConfig = await getLocalAppHostingConfiguration("test");

      expect(JSON.stringify(apphostingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "randomEnvOne", value: "envOne" },
          { variable: "randomEnvTwo", value: "blah" },
          { variable: "randomEnvThree", value: "envThree" },
          { variable: "randomEnvFour", value: "envFour" },
        ]),
      );

      expect(JSON.stringify(apphostingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "randomSecretOne", secret: "bleh" },
          { variable: "randomSecretTwo", secret: "secretTwo" },
          { variable: "randomSecretThree", secret: "secretThree" },
          { variable: "randomSecretFour", secret: "secretFour" },
        ]),
      );
    });
  });
});
