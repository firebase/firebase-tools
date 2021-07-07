import { expect } from "chai";
import * as sinon from "sinon";

import * as optionsHelper from "../../../extensions/emulator/optionsHelper";
import { ExtensionSpec } from "../../../extensions/extensionsApi";
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
    let readParamsFileStub: sinon.SinonStub;

    beforeEach(() => {
      testSpec = {
        name: "test",
        version: "0.1.0",
        resources: [],
        sourceUrl: "https://my.stuff.com",
        params: [],
      };
      readParamsFileStub = sinon.stub(paramHelper, "readParamsFile");
    });

    afterEach(() => {
      readParamsFileStub.restore();
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
      readParamsFileStub.resolves({
        USER_PARAM1: "val1",
        USER_PARAM2: "val2",
      });

      expect(optionsHelper.getParams(testOptions, testSpec)).to.eventually.deep.eq({
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
      readParamsFileStub.resolves({
        USER_PARAM1: "${PROJECT_ID}-hello",
        USER_PARAM2: "val2",
        USER_PARAM3: "${USER_PARAM2}",
      });

      expect(optionsHelper.getParams(testOptions, testSpec)).to.eventually.deep.eq({
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
        },
        {
          label: "param2",
          param: "USER_PARAM2",
          default: "hello",
        },
      ];
      readParamsFileStub.resolves({});

      expect(optionsHelper.getParams(testOptions, testSpec)).to.eventually.deep.eq({
        ...{
          USER_PARAM1: "hi",
          USER_PARAM2: "hello",
        },
        ...autoParams,
      });
    });
  });
});
