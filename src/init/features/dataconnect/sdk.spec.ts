import * as fs from "fs";
import * as sinon from "sinon";
import { expect } from "chai";

import * as sdk from "./sdk";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";

const CONNECTOR_YAML_CONTENTS = "connectorId: blah";

describe("init dataconnect:sdk", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe("actuation", () => {
    const sandbox = sinon.createSandbox();
    let generateStub: sinon.SinonStub;
    let fsStub: sinon.SinonStub;

    beforeEach(() => {
      fsStub = sandbox.stub(fs, "writeFileSync");
      generateStub = sandbox.stub(DataConnectEmulator, "generate");
    });

    afterEach(() => {
      sandbox.restore();
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
        fsStub.returns({});
        await sdk.actuate(c.sdkInfo, "TEST_PROJECT");
        expect(generateStub.called).to.equal(c.shouldGenerate);
        expect(fsStub.args).to.deep.equal([
          [
            `${process.cwd()}/dataconnect/connector/connector.yaml`,
            CONNECTOR_YAML_CONTENTS,
            "utf8",
          ],
        ]);
      });
    }
  });
});

function mockSDKInfo(shouldGenerate: boolean): sdk.SDKInfo {
  return {
    connectorYamlContents: CONNECTOR_YAML_CONTENTS,
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
    displayIOSWarning: false,
  };
}
