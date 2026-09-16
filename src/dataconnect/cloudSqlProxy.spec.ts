import { expect } from "chai";
import * as sinon from "sinon";
import { Connector } from "@google-cloud/cloud-sql-connector";

import nock from "../test/helpers/nock";
import { cloudSQLAdminOrigin } from "../api";
import { Config } from "../config";
import { FirebaseError } from "../error";
import { Options } from "../options";
import { RC } from "../rc";
import { FBToolsAuthClient } from "../gcp/cloudsql/fbToolsAuthClient";
import * as connect from "../gcp/cloudsql/connect";
import { startLocalProxyForService } from "./cloudSqlProxy";
import { ServiceInfo } from "./types";

const PROJECT_ID = "test-project";
const INSTANCE_ID = "test-instance";
const USERNAME = "tester@example.com";
const CONNECTION_NAME = "test-project:us-central1:test-instance";
const API_VERSION = "v1";

const options: Options = {
  project: PROJECT_ID,
  auth: true,
  cwd: "",
  configPath: "",
  only: "",
  except: "",
  config: new Config({}, { projectDir: "", cwd: "" }),
  filteredTargets: [],
  force: false,
  nonInteractive: false,
  debug: false,
  rc: new RC(),
};

function serviceInfo(schemaName?: string): ServiceInfo {
  return {
    serviceName: `projects/${PROJECT_ID}/locations/us-central1/services/myservice`,
    sourceDirectory: "dataconnect",
    schemas: [
      {
        name: `projects/${PROJECT_ID}/locations/us-central1/services/myservice/schemas/main`,
        datasources: [
          {
            postgresql: {
              database: "testdb",
              schema: schemaName,
              cloudSql: {
                instance: `projects/${PROJECT_ID}/locations/us-central1/instances/${INSTANCE_ID}`,
              },
            },
          },
        ],
        source: { files: [] },
      },
    ],
    connectorInfo: [],
    dataConnectYaml: {
      specVersion: "v1",
      serviceId: "myservice",
      location: "us-central1",
      connectorDirs: [],
    },
  };
}

function mockInstance(ipType: "PRIMARY" | "PRIVATE" = "PRIMARY", connectionName = CONNECTION_NAME) {
  nock(cloudSQLAdminOrigin())
    .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}`)
    .reply(200, {
      connectionName,
      ipAddresses: [{ type: ipType, ipAddress: "10.0.0.1" }],
    });
}

function mockUser(type: string) {
  nock(cloudSQLAdminOrigin())
    .get(`/${API_VERSION}/projects/${PROJECT_ID}/instances/${INSTANCE_ID}/users/${USERNAME}`)
    .reply(200, { name: USERNAME, type });
}

describe("cloudSqlProxy", () => {
  let sandbox: sinon.SinonSandbox;
  let startLocalProxyStub: sinon.SinonStub;
  let closeStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(connect, "getIAMUser").resolves({ user: USERNAME, mode: "CLOUD_IAM_USER" });
    startLocalProxyStub = sandbox.stub(Connector.prototype, "startLocalProxy").resolves();
    closeStub = sandbox.stub(Connector.prototype, "close");
  });

  afterEach(() => {
    sandbox.restore();
    nock.cleanAll();
  });

  it("returns a keyword/value DSN pointing at the proxy socket directory", async () => {
    mockInstance();
    mockUser("CLOUD_IAM_USER");

    const proxy = await startLocalProxyForService(options, serviceInfo("myschema"));

    const socketDir = startLocalProxyStub.firstCall.args[0].listenOptions.path.replace(
      /\/\.s\.PGSQL\.5432$/,
      "",
    );
    expect(proxy.connectionString).to.equal(
      `host=${socketDir} user=${USERNAME} dbname=testdb sslmode=disable` +
        ` options=-csearch_path=myschema`,
    );
    await proxy.close();
  });

  it("defaults search_path to the public schema", async () => {
    mockInstance();
    mockUser("CLOUD_IAM_USER");

    const proxy = await startLocalProxyForService(options, serviceInfo());

    expect(proxy.connectionString).to.contain("options=-csearch_path=public");
    await proxy.close();
  });

  it("uses FBToolsAuthClient and IAM auth for CLOUD_IAM_USER", async () => {
    mockInstance();
    mockUser("CLOUD_IAM_USER");

    const proxy = await startLocalProxyForService(options, serviceInfo());

    expect(startLocalProxyStub.firstCall.args[0]).to.include({
      instanceConnectionName: CONNECTION_NAME,
      ipType: "PUBLIC",
      authType: "IAM",
    });
    const connector = startLocalProxyStub.firstCall.thisValue as any;
    expect(connector.sqlAdminFetcher.auth.cachedCredential).to.be.instanceOf(FBToolsAuthClient);
    await proxy.close();
  });

  it("uses Application Default Credentials for CLOUD_IAM_SERVICE_ACCOUNT", async () => {
    mockInstance("PRIVATE");
    mockUser("CLOUD_IAM_SERVICE_ACCOUNT");

    const proxy = await startLocalProxyForService(options, serviceInfo());

    expect(startLocalProxyStub.firstCall.args[0]).to.include({
      ipType: "PRIVATE",
      authType: "IAM",
    });
    const connector = startLocalProxyStub.firstCall.thisValue as any;
    expect(connector.sqlAdminFetcher.auth.cachedCredential).to.be.null;
    await proxy.close();
  });

  it("rejects built-in users", async () => {
    mockInstance();
    mockUser("BUILT_IN");

    await expect(startLocalProxyForService(options, serviceInfo())).to.be.rejectedWith(
      FirebaseError,
      /only supports IAM database users/,
    );
    expect(startLocalProxyStub.called).to.be.false;
  });

  it("throws when the instance has no connection name", async () => {
    mockInstance("PRIMARY", "");
    mockUser("CLOUD_IAM_USER");

    await expect(startLocalProxyForService(options, serviceInfo())).to.be.rejectedWith(
      FirebaseError,
      /Could not get the connection name/,
    );
  });

  it("closes the connector when startLocalProxy fails", async () => {
    mockInstance();
    mockUser("CLOUD_IAM_USER");
    startLocalProxyStub.rejects(new Error("listen failed"));

    await expect(startLocalProxyForService(options, serviceInfo())).to.be.rejectedWith(
      "listen failed",
    );
    expect(closeStub.calledOnce).to.be.true;
  });

  it("removes its signal handlers on close", async () => {
    mockInstance();
    mockUser("CLOUD_IAM_USER");
    const before = process.listenerCount("SIGINT");

    const proxy = await startLocalProxyForService(options, serviceInfo());
    expect(process.listenerCount("SIGINT")).to.equal(before + 1);

    await proxy.close();
    expect(process.listenerCount("SIGINT")).to.equal(before);
    expect(closeStub.calledOnce).to.be.true;
  });
});
