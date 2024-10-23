import * as emulatorUtils from "../../utils";
import * as fsExtra from "fs-extra";
import * as path from "path";
import * as utils from "./utils";

import * as sinon from "sinon";
import { expect } from "chai";
import { getLocalAppHostingConfiguration, loadAppHostingYaml } from "./config";

const SAMPLE_APPHOSTING_YAML_CONFIG_ONE = {
  env: [
    {
      variable: "STORAGE_BUCKET",
      value: "mybucket.appspot.com",
      availability: ["BUILD", "RUNTIME"],
    },
    {
      variable: "API_KEY",
      secret: "myApiKeySecret",
    },
    {
      variable: "PINNED_API_KEY",
      secret: "myApiKeySecret@5",
    },
    {
      variable: "VERBOSE_API_KEY",
      secret: "projects/test-project/secrets/secretID",
    },
    {
      variable: "PINNED_VERBOSE_API_KEY",
      secret: "projects/test-project/secrets/secretID/versions/5",
    },
  ],
};

const SAMPLE_APPHOSTING_YAML_CONFIG_TWO = {
  env: [
    {
      variable: "randomEnvOne",
      value: "envOne",
    },
    {
      variable: "randomEnvTwo",
      value: "envTwo",
    },
    {
      variable: "randomEnvThree",
      value: "envThree",
    },
    { variable: "randomSecretOne", secret: "secretOne" },
    { variable: "randomSecretTwo", secret: "secretTwo" },
    { variable: "randomSecretThree", secret: "secretThree" },
  ],
};

const SAMPLE_APPHOSTING_YAML_CONFIG_THREE = {
  env: [
    {
      variable: "randomEnvOne",
      value: "envOne",
    },
    {
      variable: "randomEnvTwo",
      value: "blah",
    },
    {
      variable: "randomEnvFour",
      value: "envFour",
    },
    { variable: "randomSecretOne", secret: "bleh" },
    { variable: "randomSecretTwo", secret: "secretTwo" },
    { variable: "randomSecretFour", secret: "secretFour" },
  ],
};

describe("environments", () => {
  let pathExistsStub: sinon.SinonStub;
  let joinStub: sinon.SinonStub;
  let loggerStub: sinon.SinonStub;
  let readFileFromDirectoryStub: sinon.SinonStub;
  let wrappedSafeLoadStub: sinon.SinonStub;

  beforeEach(() => {
    pathExistsStub = sinon.stub(fsExtra, "pathExists");
    joinStub = sinon.stub(path, "join");
    loggerStub = sinon.stub(utils, "logger");
    readFileFromDirectoryStub = sinon.stub(emulatorUtils, "readFileFromDirectory");
    wrappedSafeLoadStub = sinon.stub(emulatorUtils, "wrappedSafeLoad");
  });

  afterEach(() => {
    pathExistsStub.restore();
    joinStub.restore();
    loggerStub.restore();
    readFileFromDirectoryStub.restore();
    wrappedSafeLoadStub.restore();
  });

  describe("loadAppHostingYaml", () => {
    it("should return a configuration in the correct format", async () => {
      readFileFromDirectoryStub.returns({ source: "blah" });
      wrappedSafeLoadStub.returns(SAMPLE_APPHOSTING_YAML_CONFIG_ONE);

      const res = await loadAppHostingYaml("test", "test.yaml");
      expect(JSON.stringify(res)).to.equal(
        JSON.stringify({
          environmentVariables: {
            STORAGE_BUCKET: "mybucket.appspot.com",
          },
          secrets: {
            API_KEY: "myApiKeySecret",
            PINNED_API_KEY: "myApiKeySecret@5",
            VERBOSE_API_KEY: "projects/test-project/secrets/secretID",
            PINNED_VERBOSE_API_KEY: "projects/test-project/secrets/secretID/versions/5",
          },
        }),
      );
    });
  });

  describe("getLocalAppHostingConfiguration", () => {
    it("should combine apphosting yaml files according to precedence", async () => {
      pathExistsStub.returns(true);
      readFileFromDirectoryStub.returns({ source: "blah" });

      // Second config takes precedence
      wrappedSafeLoadStub.onFirstCall().returns(SAMPLE_APPHOSTING_YAML_CONFIG_TWO);
      wrappedSafeLoadStub.onSecondCall().returns(SAMPLE_APPHOSTING_YAML_CONFIG_THREE);

      const apphostingConfig = await getLocalAppHostingConfiguration("test");

      expect(JSON.stringify(apphostingConfig)).to.equal(
        JSON.stringify({
          environmentVariables: {
            randomEnvOne: "envOne",
            randomEnvTwo: "blah",
            randomEnvThree: "envThree",
            randomEnvFour: "envFour",
          },
          secrets: {
            randomSecretOne: "bleh",
            randomSecretTwo: "secretTwo",
            randomSecretThree: "secretThree",
            randomSecretFour: "secretFour",
          },
        }),
      );
    });
  });
});
