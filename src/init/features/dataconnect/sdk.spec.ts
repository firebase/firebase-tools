import * as fs from "fs";
import * as sinon from "sinon";
import { expect } from "chai";

import * as sdk from "./sdk";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";
import { Config } from "../../../config";

const CONNECTOR_YAML_CONTENTS = "connectorId: blah";

describe("init dataconnect:sdk", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe("actuation", () => {
    const sandbox = sinon.createSandbox();
    let generateStub: sinon.SinonStub;
    let fsStub: sinon.SinonStub;
    let emptyConfig: Config;
    let askProjectWriteFileStub: sinon.SinonStub;

    beforeEach(() => {
      fsStub = sandbox.stub(fs, "writeFileSync");
      generateStub = sandbox.stub(DataConnectEmulator, "generate");
      emptyConfig = new Config({}, { projectDir: process.cwd() });
      askProjectWriteFileStub = sandbox.stub(emptyConfig, "askWriteProjectFile");
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
        desc: "should write files and generate code",
        sdkInfo: mockSDKInfo(),
        shouldGenerate: true,
      },
    ];

    for (const c of cases) {
      it(c.desc, async () => {
        generateStub.resolves();
        fsStub.returns({});

        await sdk.actuate(c.sdkInfo, emptyConfig);
        expect(generateStub.called).to.equal(c.shouldGenerate);
        expect(askProjectWriteFileStub.args).to.deep.equal([
          ["dataconnect/connector/connector.yaml", CONNECTOR_YAML_CONTENTS],
        ]);
      });
    }
  });
});

function mockSDKInfo(): sdk.SDKInfo {
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
    displayIOSWarning: false,
  };
}
