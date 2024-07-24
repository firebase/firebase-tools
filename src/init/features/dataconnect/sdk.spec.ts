import * as sinon from "sinon";
import { expect } from "chai";
import * as mockFs from "mock-fs";

import * as sdk from "./sdk";
import { DataConnectEmulator } from "../../../emulator/dataconnectEmulator";


describe("init dataconnect:sdk", () => {
  describe("askQuestions", () => {
    // TODO
  });

  describe.only("actuation", () => {
    let generateStub: sinon.SinonStub
    
    beforeEach(() => {
      generateStub = sinon.stub(DataConnectEmulator, "generate")
    });

    const cases: {
      desc: string,
      sdkInfo: sdk.SDKInfo,
    }[] = [
      {
        desc: "should write files and generate code if shouldGenerate=true",
        sdkInfo: mockSDKInfo(true),
      },
      {
        desc: "should write files and not generate code if shouldGenerate=false",
        sdkInfo: mockSDKInfo(false),
      },
    ];
  
    for (const c of cases) {
      it(c.desc, async () => {
        generateStub.resolves();

        await sdk.actuate(c.sdkInfo, "TEST_PROJECT");

        expect(generateStub).to.have.been.called;
      });
    }

  });
});


function mockSDKInfo(
  shouldGenerate: boolean
): sdk.SDKInfo{
  return {
    connectorYamlContents: "",
    connectorInfo: {
      connector: {
        name: "test",
        source: {

        },
      },
      directory: "./connector",
      connectorYaml: {
        connectorId: "app",
      }
    },
    shouldGenerate,
  };
}