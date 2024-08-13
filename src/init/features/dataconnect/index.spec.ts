import * as sinon from "sinon";
import { expect } from "chai";

import * as init from "./index";
import { Config } from "../../../config";
import { RCData } from "../../../rc";
import * as provison from "../../../dataconnect/provisionCloudSql";

const MOCK_RC: RCData = { projects: {}, targets: {}, etags: {}, dataconnectEmulatorConfig: {} };

describe("init dataconnect", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe("actuation", () => {
    const sandbox = sinon.createSandbox();
    let provisionCSQLStub: sinon.SinonStub;
    let askWriteProjectFileStub: sinon.SinonStub;

    beforeEach(() => {
      provisionCSQLStub = sandbox.stub(provison, "provisionCloudSql");
    });

    afterEach(() => {
      sandbox.restore();
    });

    const cases: {
      desc: string;
      requiredInfo: init.RequiredInfo;
      config: Config;
      expectedSource: string;
      expectedFiles: string[];
      expectCSQLProvisioning: boolean;
    }[] = [
      {
        desc: "should default to dataconnect directory",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig(),
        expectedSource: "dataconnect",
        expectedFiles: ["dataconnect/dataconnect.yaml", "dataconnect/schema/schema.gql"],
        expectCSQLProvisioning: false,
      },
      {
        desc: "should use existing directory if there is one in firebase.json",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig({ dataconnect: { source: "not-dataconnect" } }),
        expectedSource: "not-dataconnect",
        expectedFiles: ["not-dataconnect/dataconnect.yaml", "not-dataconnect/schema/schema.gql"],
        expectCSQLProvisioning: false,
      },
      {
        desc: "should write connector files",
        requiredInfo: mockRequiredInfo({
          connectors: [
            {
              id: "my-connector",
              path: "hello",
              files: [
                {
                  path: "queries.gql",
                  content: "## Fake GQL",
                },
              ],
            },
          ],
        }),
        config: mockConfig({}),
        expectedSource: "dataconnect",
        expectedFiles: [
          "dataconnect/dataconnect.yaml",
          "dataconnect/schema/schema.gql",
          "dataconnect/hello/connector.yaml",
          "dataconnect/hello/queries.gql",
        ],
        expectCSQLProvisioning: false,
      },
      {
        desc: "should provision cloudSQL resources ",
        requiredInfo: mockRequiredInfo({
          shouldProvisionCSQL: true,
        }),
        config: mockConfig({}),
        expectedSource: "dataconnect",
        expectedFiles: ["dataconnect/dataconnect.yaml", "dataconnect/schema/schema.gql"],
        expectCSQLProvisioning: true,
      },
    ];

    for (const c of cases) {
      it(c.desc, async () => {
        askWriteProjectFileStub = sandbox.stub(c.config, "askWriteProjectFile");
        askWriteProjectFileStub.resolves();
        provisionCSQLStub.resolves();
        await init.actuate(
          {
            projectId: "test-project",
            rcfile: MOCK_RC,
            config: c.config,
          },
          c.config,
          c.requiredInfo,
        );
        expect(c.config.get("dataconnect.source")).to.equal(c.expectedSource);
        expect(askWriteProjectFileStub.args.map((a) => a[0])).to.deep.equal(c.expectedFiles);
        expect(provisionCSQLStub.called).to.equal(c.expectCSQLProvisioning);
      });
    }
  });
});

function mockConfig(data: Record<string, any> = {}): Config {
  return new Config(data, {});
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
