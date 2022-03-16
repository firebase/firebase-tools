import { expect } from "chai";
import * as sinon from "sinon";

import * as optionsHelper from "../../../extensions/emulator/optionsHelper";
import { ExtensionSpec, Param, ParamType } from "../../../extensions/extensionsApi";
import * as paramHelper from "../../../extensions/paramHelper";

describe("optionsHelper", () => {
  describe("getParams", () => {
    const testOptions = {
      project: "test",
      testParams: "test.env",
    };
    const autoParams = {
      PROJECT_ID: "test",
      EXT_INSTANCE_ID: "test",
      DATABASE_INSTANCE: "test",
      DATABASE_URL: "https://test.firebaseio.com",
      STORAGE_BUCKET: "test.appspot.com",
    };
    let testSpec: ExtensionSpec;
    let readEnvFileStub: sinon.SinonStub;

    beforeEach(() => {
      testSpec = {
        name: "test",
        version: "0.1.0",
        resources: [],
        sourceUrl: "https://my.stuff.com",
        params: [],
      };
      readEnvFileStub = sinon.stub(paramHelper, "readEnvFile");
    });

    afterEach(() => {
      readEnvFileStub.restore();
    });

    it("should return user and autopopulated params", () => {
      testSpec.params = [
        {
          label: "param1",
          param: "USER_PARAM1",
        },
        {
          label: "param2",
          param: "USER_PARAM2",
        },
      ];
      readEnvFileStub.returns({
        USER_PARAM1: "val1",
        USER_PARAM2: "val2",
      });

      expect(optionsHelper.getParams(testOptions, testSpec)).to.deep.eq({
        ...{
          USER_PARAM1: "val1",
          USER_PARAM2: "val2",
        },
        ...autoParams,
      });
    });

    it("should subsitute into params that reference other params", () => {
      testSpec.params = [
        {
          label: "param1",
          param: "USER_PARAM1",
        },
        {
          label: "param2",
          param: "USER_PARAM2",
        },
        {
          label: "param3",
          param: "USER_PARAM3",
        },
      ];
      readEnvFileStub.returns({
        USER_PARAM1: "${PROJECT_ID}-hello",
        USER_PARAM2: "val2",
        USER_PARAM3: "${USER_PARAM2}",
      });

      expect(optionsHelper.getParams(testOptions, testSpec)).to.deep.eq({
        ...{
          USER_PARAM1: "test-hello",
          USER_PARAM2: "val2",
          USER_PARAM3: "val2",
        },
        ...autoParams,
      });
    });

    it("should fallback to defaults if a value isn't provided", () => {
      testSpec.params = [
        {
          label: "param1",
          param: "USER_PARAM1",
          default: "hi",
          required: true,
        },
        {
          label: "param2",
          param: "USER_PARAM2",
          default: "hello",
          required: true,
        },
      ];
      readEnvFileStub.returns({});

      expect(optionsHelper.getParams(testOptions, testSpec)).to.deep.eq({
        ...{
          USER_PARAM1: "hi",
          USER_PARAM2: "hello",
        },
        ...autoParams,
      });
    });
  });

  const TEST_SELECT_PARAM: Param = {
    param: "SELECT_PARAM",
    label: "A select param",
    type: ParamType.SELECT,
  };
  const TEST_STRING_PARAM: Param = {
    param: "STRING_PARAM",
    label: "A string param",
    type: ParamType.STRING,
  };
  const TEST_MULTISELECT_PARAM: Param = {
    param: "MULTISELECT_PARAM",
    label: "A multiselect param",
    type: ParamType.MULTISELECT,
  };
  const TEST_SECRET_PARAM: Param = {
    param: "SECRET_PARAM",
    label: "A secret param",
    type: ParamType.SECRET,
  };
  const TEST_PARAMS: Param[] = [
    TEST_SELECT_PARAM,
    TEST_STRING_PARAM,
    TEST_MULTISELECT_PARAM,
    TEST_SECRET_PARAM,
  ];
  const TEST_PARAM_VALUES = {
    SELECT_PARAM: "select",
    STRING_PARAM: "string",
    MULTISELECT_PARAM: "multiselect",
    SECRET_PARAM: "projects/test/secrets/mysecret/versionms/latest",
  };

  describe("getNonSecretEnv", () => {
    it("should return only params that are not secret", () => {
      expect(optionsHelper.getNonSecretEnv(TEST_PARAMS, TEST_PARAM_VALUES)).to.deep.equal({
        SELECT_PARAM: "select",
        STRING_PARAM: "string",
        MULTISELECT_PARAM: "multiselect",
      });
    });
  });

  describe("getSecretEnv", () => {
    it("should return only params that are secret", () => {
      expect(optionsHelper.getSecretEnvVars(TEST_PARAMS, TEST_PARAM_VALUES)).to.have.deep.members([
        {
          projectId: "test",
          key: "SECRET_PARAM",
          secret: "mysecret",
          version: "latest",
        },
      ]);
    });
  });
});
