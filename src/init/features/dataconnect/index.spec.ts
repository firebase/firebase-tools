import * as fs from "fs";
import * as sinon from "sinon";
import { expect } from "chai";

import * as init from "./index";
import { Config } from "../../../config";
import { RCData } from "../../../rc";

const CONNECTOR_YAML_CONTENTS = "connectorId: blah";
const MOCK_RC: RCData = { projects: {}, targets: {}, etags: {}, dataconnectEmulatorConfig: {} };

describe("init dataconnect:sdk", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe.only("actuation", () => {
    const sandbox = sinon.createSandbox();
    let generateStub: sinon.SinonStub;
    let fsStub: sinon.SinonStub;

    beforeEach(() => {
      fsStub = sandbox.stub(fs, "writeFileSync");
    });

    afterEach(() => {
      sandbox.restore();
    });

    const cases: {
      desc: string;
      requiredInfo: init.RequiredInfo;
      config: Config;
      expectedSource: string;
    }[] = [
      {
        desc: "should default to dataconnect directory",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig(),
        expectedSource: "dataconnect",
      },
      {
        desc: "should use existing directory if there is one in firebase.json",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig().set("dataconnect", { source: "not-dataconnect" }),
        expectedSource: "not-dataconnect",
      },
    ];

    for (const c of cases) {
      it(c.desc, async () => {
        generateStub.resolves();
        fsStub.returns({});
        await init.actuate(
          {
            rcfile: MOCK_RC,
            config: c.config,
          },
          c.config,
          c.requiredInfo,
        );
        expect(c.config.get("dataconnec.source")).to.equal(c.expectedSource);
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

function mockConfig(config: Partial<Config> = {}): Config {
  return new Config(config, {});
}
function mockRequiredInfo(info: Partial<init.RequiredInfo> = {}): init.RequiredInfo {
  return {
    serviceId: "test-service",
    locationId: "europe-north3",
    cloudSqlInstanceId: "csql-instance",
    cloudSqlDatabase: "csql-db",
    isNewDatabase: false,
    isNewInstance: false,
    shouldProvisionCSQL: false,
    connectors: [],
    schemaGql: [],
    ...info,
  };
}
