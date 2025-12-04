import { expect } from "chai";
import * as sinon from "sinon";
import nock from "nock";
import * as deploy from "./deploy";
import * as utils from "../../utils";
import * as projectUtils from "../../projectUtils";
import * as provisionCloudSql from "../../dataconnect/provisionCloudSql";
import * as ensureApiEnabled from "../../ensureApiEnabled";
import * as prompt from "../../prompt";
import * as poller from "../../operation-poller";
import { dataconnectOrigin } from "../../api";
import { initDeployStats } from "./context";

describe("dataconnect deploy", () => {
  let sandbox: sinon.SinonSandbox;
  let setupCloudSqlStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    setupCloudSqlStub = sandbox.stub(provisionCloudSql, "setupCloudSql").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project");
    sandbox.stub(ensureApiEnabled, "ensure").resolves();
    confirmStub = sandbox.stub(prompt, "confirm").resolves(false);
    sandbox.stub(utils, "logLabeledSuccess");
    pollOperationStub = sandbox.stub(poller, "pollOperation").resolves();
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should create a new service", async () => {
    nock(dataconnectOrigin())
      .get("/v1/projects/test-project/locations/-/services")
      .reply(200, { services: [] });
    nock(dataconnectOrigin())
      .post("/v1/projects/test-project/locations/l/services?service_id=s1")
      .reply(200, { name: "op-name" });

    const serviceInfos = [
      {
        serviceName: "projects/test-project/locations/l/services/s1",
        deploymentMetadata: {},
        schemas: [
          {
            name: "projects/test-project/locations/l/services/s1/schemas/main",
            datasources: [],
          },
        ],
        dataConnectYaml: { serviceId: "s1" },
      },
    ];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await deploy.default(context as any, options);
    expect(pollOperationStub.calledOnce).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should delete an old service if confirmed", async () => {
    const existingServices = [{ name: "projects/test-project/locations/l/services/s2" }];
    nock(dataconnectOrigin())
      .get("/v1/projects/test-project/locations/-/services")
      .reply(200, { services: existingServices });
    nock(dataconnectOrigin())
      .delete("/v1/projects/test-project/locations/l/services/s2?force=true")
      .reply(200, { name: "op-name" });

    confirmStub.resolves(true);
    const serviceInfos: any[] = [];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await deploy.default(context as any, options);

    expect(pollOperationStub.calledOnce).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should not delete an old service if not confirmed", async () => {
    const existingServices = [{ name: "projects/test-project/locations/l/services/s2" }];
    nock(dataconnectOrigin())
      .get("/v1/projects/test-project/locations/-/services")
      .reply(200, { services: existingServices });

    confirmStub.resolves(false);
    const serviceInfos: any[] = [];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await deploy.default(context as any, options);

    expect(pollOperationStub.notCalled).to.be.true;
    expect(nock.isDone()).to.be.true;
  });

  it("should provision cloud sql", async () => {
    nock(dataconnectOrigin())
      .get("/v1/projects/test-project/locations/-/services")
      .reply(200, { services: [] });
    nock(dataconnectOrigin())
      .post("/v1/projects/test-project/locations/l/services?service_id=s1")
      .reply(200, { name: "op-name" });
    const serviceInfos = [
      {
        serviceName: "projects/test-project/locations/l/services/s1",
        schemas: [
          {
            name: "projects/test-project/locations/l/services/s1/schemas/main",
            datasources: [
              {
                postgresql: {
                  cloudSql: { instance: "projects/p/locations/l/instances/i" },
                  database: "db",
                },
              },
            ],
          },
        ],
        deploymentMetadata: {},
        dataConnectYaml: { serviceId: "s1" },
      },
    ];
    const context = { dataconnect: { serviceInfos, deployStats: initDeployStats() } };
    const options = {} as any;

    await deploy.default(context as any, options);

    expect(setupCloudSqlStub.calledOnce).to.be.true;
  });

  it("should not delete services if filters are present", async () => {
    const existingServices = [{ name: "projects/test-project/locations/l/services/s2" }];
    nock(dataconnectOrigin())
      .get("/v1/projects/test-project/locations/-/services")
      .reply(200, { services: existingServices });

    const serviceInfos: any[] = [];
    const context = {
      dataconnect: { serviceInfos, filters: [{ serviceId: "s1" }], deployStats: initDeployStats() },
    };
    const options = {} as any;

    await deploy.default(context as any, options);

    expect(pollOperationStub.notCalled).to.be.true;
    expect(nock.isDone()).to.be.true;
  });
});
