import { expect } from "chai";
import * as sinon from "sinon";
import { execute_mutation } from "./execute_mutation";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import * as fileUtils from "../../../dataconnect/fileUtils";
import * as converter from "./converter";
import * as emulator from "./emulator";
import * as util from "../../util";
import { Client } from "../../../apiv2";

describe("execute_mutation tool", () => {
  const projectId = "test-project";
  const operationName = "myMutation";
  const serviceId = "my-service";
  const connectorId = "my-connector";
  const serviceName = `projects/${projectId}/locations/us-central1/services/${serviceId}`;
  const connectorPath = `${serviceName}/connectors/${connectorId}`;
  const mockClient = new Client({ urlPrefix: "http://localhost" });
  const mockResponse = { body: { data: { myMutation: { success: true } } } };
  const mockHost: any = {};
  const mockConfig: any = {};

  let pickServiceStub: sinon.SinonStub;
  let dataplaneClientStub: sinon.SinonStub;
  let emulatorClientStub: sinon.SinonStub;
  let executeGraphQLMutationStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    pickServiceStub = sinon.stub(fileUtils, "pickService");
    dataplaneClientStub = sinon.stub(dataplane, "dataconnectDataplaneClient");
    emulatorClientStub = sinon.stub(emulator, "getDataConnectEmulatorClient");
    executeGraphQLMutationStub = sinon.stub(dataplane, "executeGraphQLMutation");
    mcpErrorStub = sinon.stub(util, "mcpError");
    sinon.stub(converter, "parseVariables").returns({});
    sinon.stub(converter, "graphqlResponseToToolResponse").returns({} as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should execute a mutation against production", async () => {
    pickServiceStub.resolves({ serviceName, connectorInfo: [] });
    dataplaneClientStub.returns(mockClient);
    executeGraphQLMutationStub.resolves(mockResponse);

    await (execute_mutation as any)._fn(
      { operationName, service_id: serviceId, connector_id: connectorId },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(executeGraphQLMutationStub).to.be.calledWith(mockClient, connectorPath, sinon.match.any);
  });

  it("should execute a mutation against the emulator", async () => {
    pickServiceStub.resolves({ serviceName, connectorInfo: [] });
    emulatorClientStub.resolves(mockClient);
    executeGraphQLMutationStub.resolves(mockResponse);

    await (execute_mutation as any)._fn(
      { operationName, service_id: serviceId, connector_id: connectorId, use_emulator: true },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(emulatorClientStub).to.be.calledOnce;
  });

  it("should infer connector_id if only one exists", async () => {
    pickServiceStub.resolves({
      serviceName,
      connectorInfo: [{ connectorYaml: { connectorId } }],
    });
    dataplaneClientStub.returns(mockClient);
    executeGraphQLMutationStub.resolves(mockResponse);

    await (execute_mutation as any)._fn(
      { operationName, service_id: serviceId },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(executeGraphQLMutationStub).to.be.calledWith(mockClient, connectorPath, sinon.match.any);
  });

  it("should return an error if no connectors are found", async () => {
    pickServiceStub.resolves({ serviceName, connectorInfo: [] });
    await (execute_mutation as any)._fn(
      { operationName, service_id: serviceId },
      { projectId, config: mockConfig, host: mockHost },
    );
    expect(mcpErrorStub).to.be.calledWithMatch("no connectors");
  });

  it("should return an error if multiple connectors are found", async () => {
    pickServiceStub.resolves({
      serviceName,
      connectorInfo: [
        { connectorYaml: { connectorId: "c1" } },
        { connectorYaml: { connectorId: "c2" } },
      ],
    });
    await (execute_mutation as any)._fn(
      { operationName, service_id: serviceId },
      { projectId, config: mockConfig, host: mockHost },
    );
    expect(mcpErrorStub).to.be.calledWithMatch("more than one connector");
  });
});
