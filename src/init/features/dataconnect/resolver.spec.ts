import * as chai from "chai";
import * as clc from "colorette";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import * as sinon from "sinon";

import {
  addSchemaToDataConnectYaml,
  askQuestions,
  actuate,
  ResolverRequiredInfo,
} from "./resolver";
import { Setup } from "../..";
import { Config } from "../../../config";
import * as load from "../../../dataconnect/load";
import { DataConnectYaml, ServiceInfo } from "../../../dataconnect/types";
import * as experiments from "../../../experiments";
import * as prompt from "../../../prompt";

const expect = chai.expect;

describe("addSchemaToDataConnectYaml", () => {
  let schemaRequiredInfo: ResolverRequiredInfo;
  let dataConnectYaml: DataConnectYaml;

  beforeEach(() => {
    dataConnectYaml = {
      location: "us-central1",
      serviceId: "service-id",
      connectorDirs: [],
    };
    schemaRequiredInfo = {
      id: "test_resolver",
      uri: "www.test.com",
      serviceInfo: {} as ServiceInfo,
    };
  });

  it("add schema to dataconnect.yaml with `schema` field", () => {
    dataConnectYaml.schema = {
      source: "./schema",
      datasource: {},
    };
    addSchemaToDataConnectYaml(dataConnectYaml, schemaRequiredInfo);
    expect(dataConnectYaml.schema).to.be.undefined;
    expect(dataConnectYaml.schemas).to.have.lengthOf(2);
    expect(dataConnectYaml.schemas).to.deep.equal([
      {
        source: "./schema",
        datasource: {},
      },
      {
        source: "./schema_test_resolver",
        id: "test_resolver",
        datasource: {
          httpGraphql: {
            uri: "www.test.com",
          },
        },
      },
    ]);
  });
  it("add schema to dataconnect.yaml with `schemas` field", () => {
    dataConnectYaml.schemas = [
      {
        source: "./schema",
        datasource: {},
      },
      {
        source: "./schema_existing",
        datasource: {},
      },
    ];
    addSchemaToDataConnectYaml(dataConnectYaml, schemaRequiredInfo);
    expect(dataConnectYaml.schema).to.be.undefined;
    expect(dataConnectYaml.schemas).to.have.lengthOf(3);
    expect(dataConnectYaml.schemas).to.deep.equal([
      {
        source: "./schema",
        datasource: {},
      },
      {
        source: "./schema_existing",
        datasource: {},
      },
      {
        source: "./schema_test_resolver",
        id: "test_resolver",
        datasource: {
          httpGraphql: {
            uri: "www.test.com",
          },
        },
      },
    ]);
  });
});

describe("askQuestions", () => {
  let setup: Setup;
  let config: Config;
  let experimentsStub: sinon.SinonStub;
  let loadAllStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;
  let inputStub: sinon.SinonStub;

  beforeEach(() => {
    setup = {
      config: {} as any,
      rcfile: {} as any,
      instructions: [],
    };
    config = new Config({}, { projectDir: "." });
    experimentsStub = sinon.stub(experiments, "isEnabled");
    loadAllStub = sinon.stub(load, "loadAll");
    selectStub = sinon.stub(prompt, "select");
    inputStub = sinon.stub(prompt, "input");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should throw error when no services", async () => {
    experimentsStub.returns(true);
    loadAllStub.resolves([]);

    try {
      await askQuestions(setup, config);
    } catch (err: any) {
      expect(err.message).to.equal(
        `No Firebase Data Connect workspace found. Run ${clc.bold(
          "firebase init dataconnect",
        )} to set up a service and main schema.`,
      );
    }
  });

  it("should skip service selection when exactly one service", async () => {
    experimentsStub.returns(true);
    loadAllStub.resolves([
      {
        serviceName: "projects/project-id/locations/us-central1/services/service-id",
        dataConnectYaml: { location: "us-central1", serviceId: "service-id" },
      },
    ]);
    inputStub.onFirstCall().resolves("test_resolver");

    await askQuestions(setup, config);

    expect(selectStub.called).to.be.false;
    expect(inputStub.calledOnce).to.be.true;
    expect(setup.featureInfo?.dataconnectResolver?.id).to.equal("test_resolver");
    expect(setup.featureInfo?.dataconnectResolver?.uri).to.equal(
      "https://test_resolver-PROJECT_NUMBER.us-central1.run.app/graphql",
    );
    expect(setup.featureInfo?.dataconnectResolver?.serviceInfo.serviceName).to.equal(
      "projects/project-id/locations/us-central1/services/service-id",
    );
  });

  it("should prompt for service selection when multiple services", async () => {
    experimentsStub.returns(true);
    loadAllStub.resolves([
      { serviceName: "projects/project-id/locations/us-central1/services/service-id" },
      {
        serviceName: "projects/project-id/locations/us-central1/services/service-id2",
        dataConnectYaml: { location: "us-central1", serviceId: "service-id2" },
      },
    ]);
    selectStub.resolves({
      serviceName: "projects/project-id/locations/us-central1/services/service-id2",
      dataConnectYaml: { location: "us-central1", serviceId: "service-id2" },
    });
    inputStub.onFirstCall().resolves("test_resolver");

    await askQuestions(setup, config);

    expect(selectStub.calledOnce).to.be.true;
    expect(inputStub.calledOnce).to.be.true;
    expect(setup.featureInfo?.dataconnectResolver?.id).to.equal("test_resolver");
    expect(setup.featureInfo?.dataconnectResolver?.uri).to.equal(
      "https://test_resolver-PROJECT_NUMBER.us-central1.run.app/graphql",
    );
    expect(setup.featureInfo?.dataconnectResolver?.serviceInfo.serviceName).to.equal(
      "projects/project-id/locations/us-central1/services/service-id2",
    );
  });

  it("uses project number in URI if set", async () => {
    setup.projectNumber = "123456789";
    experimentsStub.returns(true);
    loadAllStub.resolves([
      {
        serviceName: "projects/project-id/locations/us-central1/services/service-id",
        dataConnectYaml: { location: "us-central1", serviceId: "service-id" },
      },
    ]);
    inputStub.onFirstCall().resolves("test_resolver");

    await askQuestions(setup, config);

    expect(selectStub.called).to.be.false;
    expect(inputStub.calledOnce).to.be.true;
    expect(setup.featureInfo?.dataconnectResolver?.id).to.equal("test_resolver");
    expect(setup.featureInfo?.dataconnectResolver?.uri).to.equal(
      "https://test_resolver-123456789.us-central1.run.app/graphql",
    );
    expect(setup.featureInfo?.dataconnectResolver?.serviceInfo.serviceName).to.equal(
      "projects/project-id/locations/us-central1/services/service-id",
    );
  });
});

describe("actuate", () => {
  let setup: Setup;
  let config: Config;
  let experimentsStub: sinon.SinonStub;
  let writeProjectFileStub: sinon.SinonStub;
  let ensureSyncStub: sinon.SinonStub;

  beforeEach(() => {
    experimentsStub = sinon.stub(experiments, "isEnabled");
    writeProjectFileStub = sinon.stub();
    ensureSyncStub = sinon.stub(fs, "ensureFileSync");

    setup = {
      config: { projectDir: "/path/to/project" } as any,
      rcfile: {} as any,
      featureInfo: {
        dataconnectResolver: {
          id: "test_resolver",
          uri: "www.test.com",
          serviceInfo: {
            sourceDirectory: "/path/to/service",
            serviceName: "service-id",
            schemas: [],
            dataConnectYaml: {
              location: "us-central1",
              serviceId: "service-id",
              schemas: [
                {
                  source: "./schema",
                  datasource: {},
                },
              ],
              connectorDirs: [],
            },
            connectorInfo: [],
          },
        },
      },
      instructions: [],
    };
    config = {
      writeProjectFile: writeProjectFileStub,
      projectDir: "/path/to/project",
      get: () => ({}),
      set: () => ({}),
      has: () => true,
      path: (p: string) => p,
      readProjectFile: () => ({}),
      projectFileExists: () => true,
      deleteProjectFile: () => ({}),
      confirmWriteProjectFile: async () => true,
      askWriteProjectFile: async () => ({}),
    } as unknown as Config;
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should no-op when fdcwebhooks experiment is not enabled", async () => {
    experimentsStub.returns(false);

    await actuate(setup, config);

    expect(writeProjectFileStub.called).to.be.false;
    expect(ensureSyncStub.called).to.be.false;
  });

  it("should write dataconnect.yaml and set up empty secondary schema file", async () => {
    experimentsStub.returns(true);

    await actuate(setup, config);

    expect(writeProjectFileStub.calledOnce).to.be.true;
    const writtenYamlPath = writeProjectFileStub.getCall(0).args[0];
    const writtenYamlContents = writeProjectFileStub.getCall(0).args[1];
    const parsedYaml = yaml.load(writtenYamlContents);
    expect(writtenYamlPath).to.equal("../service/dataconnect.yaml");
    expect(parsedYaml.schemas).to.have.lengthOf(2);
    expect(ensureSyncStub.calledOnce).to.be.true;
    const writtenSchemaPath = ensureSyncStub.getCall(0).args[0];
    expect(writtenSchemaPath).to.equal("/path/to/service/schema_test_resolver/schema.gql");
  });
});
