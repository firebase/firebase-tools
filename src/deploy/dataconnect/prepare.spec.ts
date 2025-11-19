import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import * as prepare from "./prepare";
import * as load from "../../dataconnect/load";
import * as utils from "../../utils";
import * as projectUtils from "../../projectUtils";
import * as filters from "../../dataconnect/filters";
import * as build from "../../dataconnect/build";
import * as ensureApis from "../../dataconnect/ensureApis";
import * as requireTosAcceptance from "../../requireTosAcceptance";
import * as cloudbilling from "../../gcp/cloudbilling";
import * as schemaMigration from "../../dataconnect/schemaMigration";
import * as provisionCloudSql from "../../dataconnect/provisionCloudSql";
import { FirebaseError } from "../../error";

describe("dataconnect prepare", () => {
  let sandbox: sinon.SinonSandbox;
  let loadAllStub: sinon.SinonStub;
  let buildStub: sinon.SinonStub;
  let getResourceFiltersStub: sinon.SinonStub;
  let diffSchemaStub: sinon.SinonStub;
  let setupCloudSqlStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    loadAllStub = sandbox.stub(load, "loadAll").resolves([]);
    buildStub = sandbox.stub(build, "build").resolves({} as any);
    sandbox.stub(ensureApis, "ensureApis").resolves();
    sandbox.stub(requireTosAcceptance, "requireTosAcceptance").returns(() => Promise.resolve());
    getResourceFiltersStub = sandbox.stub(filters, "getResourceFilters").returns(undefined);
    diffSchemaStub = sandbox.stub(schemaMigration, "diffSchema").resolves();
    setupCloudSqlStub = sandbox.stub(provisionCloudSql, "setupCloudSql").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project");
    sandbox.stub(utils, "logLabeledBullet");
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("should do nothing if there are no services", async () => {
    const context = {};
    const options = { config: {} } as any;
    await prepare.default(context, options);
    expect(loadAllStub.calledOnce).to.be.true;
    expect(buildStub.notCalled).to.be.true;
    expect(context).to.deep.equal({
      dataconnect: {
        serviceInfos: [],
        filters: undefined,
        deployStats: (context as any).dataconnect.deployStats,
      },
    });
  });

  it("should build services", async () => {
    const serviceInfos = [{ sourceDirectory: "a" }, { sourceDirectory: "b" }];
    loadAllStub.resolves(serviceInfos as any);
    const context = {};
    const options = { config: {} } as any;
    await prepare.default(context, options);
    expect(buildStub.callCount).to.equal(2);
    expect(context).to.deep.equal({
      dataconnect: {
        serviceInfos: serviceInfos,
        filters: undefined,
        deployStats: (context as any).dataconnect.deployStats,
      },
    });
  });

  it("should throw an error for unmatched filters", async () => {
    const serviceInfos = [
      {
        dataConnectYaml: { serviceId: "service1" },
        connectorInfo: [{ connectorYaml: { connectorId: "connector1" } }],
      },
    ];
    loadAllStub.resolves(serviceInfos as any);
    getResourceFiltersStub.returns([{ serviceId: "service2" }]);
    const context = {};
    const options = { config: {} } as any;
    await expect(prepare.default(context, options)).to.be.rejectedWith(
      FirebaseError,
      "The following filters were specified in --only but didn't match anything in this project",
    );
  });

  describe("dryRun", () => {
    it("should diff schema and setup cloud sql", async () => {
      const serviceInfos = [
        {
          schema: {
            datasources: [
              {
                postgresql: {
                  cloudSql: { instance: "projects/p/locations/l/instances/i" },
                  database: "db",
                },
              },
            ],
          },
          serviceName: "projects/p/locations/l/services/s",
          deploymentMetadata: {},
          dataConnectYaml: {
            schema: {
              datasource: {
                postgresql: {
                  schemaValidation: "STRICT",
                },
              },
            },
          },
        },
      ];
      loadAllStub.resolves(serviceInfos as any);
      const context = {};
      const options = { config: {}, dryRun: true } as any;
      await prepare.default(context, options);
      expect(diffSchemaStub.calledOnce).to.be.true;
      expect(setupCloudSqlStub.calledOnce).to.be.true;
    });
  });
});
