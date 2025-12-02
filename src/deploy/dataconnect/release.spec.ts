import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as release from "./release";
import * as utils from "../../utils";
import * as projectUtils from "../../projectUtils";
import * as schemaMigration from "../../dataconnect/schemaMigration";
import * as prompts from "../../dataconnect/prompts";
import { logger } from "../../logger";
import * as poller from "../../operation-poller";
import { dataconnectOrigin } from "../../api";
import { initDeployStats } from "./context";

describe("dataconnect release", () => {
  let sandbox: sinon.SinonSandbox;
  let migrateSchemaStub: sinon.SinonStub;
  let promptDeleteConnectorStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    migrateSchemaStub = sandbox.stub(schemaMigration, "migrateSchema").resolves();
    promptDeleteConnectorStub = sandbox.stub(prompts, "promptDeleteConnector").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project");
    sandbox.stub(utils, "logLabeledSuccess");
    sandbox
      .stub(utils, "consoleUrl")
      .returns("https://console.firebase.google.com/project/test-project/dataconnect");
    sandbox.stub(logger, "debug");
    pollOperationStub = sandbox.stub(poller, "pollOperation").resolves();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should deploy a schema and a connector", async () => {
    nock(dataconnectOrigin())
      .patch("/v1/projects/p/locations/l/services/s1/connectors/c1?allow_missing=true")
      .reply(200, { name: "op-name" });
    nock(dataconnectOrigin())
      .get("/v1/projects/p/locations/l/services/s1/connectors?pageSize=100&pageToken=&fields=")
      .reply(200, { connectors: [] });

    const serviceInfos = [
      {
        serviceName: "projects/p/locations/l/services/s1",
        dataConnectYaml: {
          serviceId: "s1",
          schema: { datasource: { postgresql: { schemaValidation: "STRICT" } } },
        },
        schemas: [{ name: "projects/p/locations/l/services/s1/schemas/main" }],
        connectorInfo: [
          {
            connector: { name: "projects/p/locations/l/services/s1/connectors/c1" },
            connectorYaml: { connectorId: "c1" },
          },
        ],
      },
    ];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await release.default(context as any, options);

    expect(migrateSchemaStub.calledOnce).to.be.true;
    expect(pollOperationStub.calledOnce).to.be.true;
    expect(promptDeleteConnectorStub.notCalled).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should handle connector pre-deployment failure", async () => {
    nock(dataconnectOrigin())
      .patch("/v1/projects/p/locations/l/services/s1/connectors/c1?allow_missing=true")
      .reply(500, "pre-deploy failed");
    nock(dataconnectOrigin())
      .patch("/v1/projects/p/locations/l/services/s1/connectors/c1?allow_missing=true")
      .reply(200, { name: "op-name" });
    nock(dataconnectOrigin())
      .get("/v1/projects/p/locations/l/services/s1/connectors?pageSize=100&pageToken=&fields=")
      .reply(200, { connectors: [] });

    const serviceInfos = [
      {
        serviceName: "projects/p/locations/l/services/s1",
        dataConnectYaml: {
          serviceId: "s1",
          schema: { datasource: { postgresql: { schemaValidation: "STRICT" } } },
        },
        schemas: [{ name: "projects/p/locations/l/services/s1/schemas/main" }],
        connectorInfo: [
          {
            connector: { name: "projects/p/locations/l/services/s1/connectors/c1" },
            connectorYaml: { connectorId: "c1" },
          },
        ],
      },
    ];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await release.default(context as any, options);

    expect(migrateSchemaStub.calledOnce).to.be.true;
    expect(pollOperationStub.calledOnce).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should prompt to delete unused connectors", async () => {
    nock(dataconnectOrigin())
      .patch("/v1/projects/p/locations/l/services/s1/connectors/c1?allow_missing=true")
      .reply(200, { name: "op-name" });
    nock(dataconnectOrigin())
      .get("/v1/projects/p/locations/l/services/s1/connectors?pageSize=100&pageToken=&fields=")
      .reply(200, {
        connectors: [{ name: "projects/p/locations/l/services/s1/connectors/unused-connector" }],
      });

    const serviceInfos = [
      {
        serviceName: "projects/p/locations/l/services/s1",
        dataConnectYaml: {
          serviceId: "s1",
          schema: { datasource: { postgresql: { schemaValidation: "STRICT" } } },
        },
        schemas: [{ name: "projects/p/locations/l/services/s1/schemas/main" }],
        connectorInfo: [
          {
            connector: { name: "projects/p/locations/l/services/s1/connectors/c1" },
            connectorYaml: { connectorId: "c1" },
          },
        ],
      },
    ];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await release.default(context as any, options);

    expect(
      promptDeleteConnectorStub.calledOnceWith(
        options,
        "projects/p/locations/l/services/s1/connectors/unused-connector",
      ),
    ).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should not prompt to delete unused connectors with filters", async () => {
    nock(dataconnectOrigin())
      .patch("/v1/projects/p/locations/l/services/s1/connectors/c1?allow_missing=true")
      .reply(200, { name: "op-name" });
    nock(dataconnectOrigin())
      .get("/v1/projects/p/locations/l/services/s1/connectors?pageSize=100&pageToken=&fields=")
      .reply(200, {
        connectors: [{ name: "projects/p/locations/l/services/s1/connectors/unused-connector" }],
      });
    const serviceInfos = [
      {
        serviceName: "projects/p/locations/l/services/s1",
        dataConnectYaml: {
          serviceId: "s1",
          schema: { datasource: { postgresql: { schemaValidation: "STRICT" } } },
        },
        schemas: [{ name: "projects/p/locations/l/services/s1/schemas/main" }],
        connectorInfo: [
          {
            connector: { name: "projects/p/locations/l/services/s1/connectors/c1" },
            connectorYaml: { connectorId: "c1" },
          },
        ],
      },
    ];
    const context = {
      dataconnect: { serviceInfos, filters: [{ serviceId: "s1" }], deployStats: initDeployStats() },
    };
    const options = {} as any;

    await release.default(context as any, options);

    expect(promptDeleteConnectorStub.notCalled).to.be.true;
  });
});
