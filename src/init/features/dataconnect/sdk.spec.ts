import * as mockFs from "mock-fs";
import * as sinon from "sinon";
import { expect } from "chai";

import * as sdk from "./sdk";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";

describe("init dataconnect:sdk", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe("actuation", () => {
    let generateStub: sinon.SinonStub;

    beforeEach(() => {
      mockFs(
        {
          "dataconnect/connector/connector.yaml": "connectorId: blah",
        },
        { createCwd: false },
      );
      generateStub = sinon.stub(DataConnectEmulator, "generate");
    });

    afterEach(() => {
      mockFs.restore();
      generateStub.restore();
    });

    const cases: {
      desc: string;
      sdkInfo: sdk.SDKInfo;
      shouldGenerate: boolean;
    }[] = [
      {
        desc: "should write files and generate code if shouldGenerate=true",
        sdkInfo: mockSDKInfo(true),
        shouldGenerate: true,
      },
      {
        desc: "should write files and not generate code if shouldGenerate=false",
        sdkInfo: mockSDKInfo(false),
        shouldGenerate: false,
      },
    ];

    for (const c of cases) {
      it(c.desc, async () => {
        generateStub.resolves();
        await sdk.actuate(c.sdkInfo, "TEST_PROJECT");
        expect(generateStub.called).to.equal(c.shouldGenerate);
      });
    }
  });
});

function mockSDKInfo(shouldGenerate: boolean): sdk.SDKInfo {
  return {
    connectorYamlContents: "",
    connectorInfo: {
      connector: {
        name: "test",
        source: {},
      },
      directory: `${process.cwd()}/dataconnect/connector`,
      connectorYaml: {
        connectorId: "app",
      },
    },
    shouldGenerate,
  };
}
