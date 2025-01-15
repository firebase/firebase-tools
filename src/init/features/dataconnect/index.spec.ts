import * as sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs-extra";

import * as init from "./index";
import { Config } from "../../../config";
import { RCData } from "../../../rc";
import * as provison from "../../../dataconnect/provisionCloudSql";

const MOCK_RC: RCData = { projects: {}, targets: {}, etags: {} };

describe("init dataconnect", () => {
  describe.skip("askQuestions", () => {
    // TODO: Add unit tests for askQuestions
  });

  describe("actuation", () => {
    const sandbox = sinon.createSandbox();
    let provisionCSQLStub: sinon.SinonStub;
    let askWriteProjectFileStub: sinon.SinonStub;
    let ensureSyncStub: sinon.SinonStub;

    beforeEach(() => {
      provisionCSQLStub = sandbox.stub(provison, "provisionCloudSql");
      ensureSyncStub = sandbox.stub(fs, "ensureFileSync");
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
      expectEnsureSchemaGQL: boolean;
    }[] = [
      {
        desc: "empty project should generate template",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig(),
        expectedSource: "dataconnect",
        expectedFiles: [
          "dataconnect/dataconnect.yaml",
          "dataconnect/schema/schema.gql",
          "dataconnect/connector/connector.yaml",
          "dataconnect/connector/queries.gql",
          "dataconnect/connector/mutations.gql",
        ],
        expectCSQLProvisioning: false,
        expectEnsureSchemaGQL: false,
      },
      {
        desc: "existing project should use existing directory",
        requiredInfo: mockRequiredInfo(),
        config: mockConfig({ dataconnect: { source: "not-dataconnect" } }),
        expectedSource: "not-dataconnect",
        expectedFiles: ["not-dataconnect/dataconnect.yaml"],
        expectCSQLProvisioning: false,
        expectEnsureSchemaGQL: false,
      },
      {
        desc: "should write schema files",
        requiredInfo: mockRequiredInfo({
          schemaGql: [
            {
              path: "schema.gql",
              content: "## Fake GQL",
            },
          ],
        }),
        config: mockConfig({}),
        expectedSource: "dataconnect",
        expectedFiles: ["dataconnect/dataconnect.yaml", "dataconnect/schema/schema.gql"],
        expectCSQLProvisioning: false,
        expectEnsureSchemaGQL: false,
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
          "dataconnect/hello/connector.yaml",
          "dataconnect/hello/queries.gql",
        ],
        expectCSQLProvisioning: false,
        expectEnsureSchemaGQL: false,
      },
      {
        desc: "should provision cloudSQL resources ",
        requiredInfo: mockRequiredInfo({
          shouldProvisionCSQL: true,
        }),
        config: mockConfig({}),
        expectedSource: "dataconnect",
        expectedFiles: [
          "dataconnect/dataconnect.yaml",
          "dataconnect/schema/schema.gql",
          "dataconnect/connector/connector.yaml",
          "dataconnect/connector/queries.gql",
          "dataconnect/connector/mutations.gql",
        ],
        expectCSQLProvisioning: true,
        expectEnsureSchemaGQL: false,
      },
      {
        desc: "should handle schema with no files",
        requiredInfo: mockRequiredInfo({
          schemaGql: [],
        }),
        config: mockConfig({
          dataconnect: {
            source: "dataconnect",
          },
        }),
        expectedSource: "dataconnect",
        expectedFiles: ["dataconnect/dataconnect.yaml"],
        expectCSQLProvisioning: false,
        expectEnsureSchemaGQL: true,
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
        if (c.expectEnsureSchemaGQL) {
          expect(ensureSyncStub).to.have.been.calledWith("dataconnect/schema/schema.gql");
        }
        expect(askWriteProjectFileStub.args.map((a) => a[0])).to.deep.equal(c.expectedFiles);
        expect(provisionCSQLStub.called).to.equal(c.expectCSQLProvisioning);
      });
    }
  });

  describe("toDNSCompatibleId", () => {
    const cases: { description: string; input: string; expected: string }[] = [
      {
        description: "Should noop compatible strings",
        input: "this-is-compatible",
        expected: "this-is-compatible",
      },
      {
        description: "Should lower case",
        input: "This-Is-Compatible",
        expected: "this-is-compatible",
      },
      {
        description: "Should strip special characters",
        input: "this-is-compatible?~!@#$%^&*()_+=",
        expected: "this-is-compatible",
      },
      {
        description: "Should strip trailing and leading -",
        input: "---this-is-compatible---",
        expected: "this-is-compatible",
      },
      {
        description: "Should cut to 63 characters",
        input: "a".repeat(1000),
        expected: "a".repeat(63),
      },
    ];
    for (const c of cases) {
      it(c.description, () => {
        expect(init.toDNSCompatibleId(c.input)).to.equal(c.expected);
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
