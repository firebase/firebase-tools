import { expect } from "chai";
import * as sinon from "sinon";
import { execute_graphql } from "./execute_graphql";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import * as fileUtils from "../../../dataconnect/fileUtils";
import * as converter from "./converter";
import * as emulator from "./emulator";
import { Client } from "../../../apiv2";

describe("execute_graphql tool", () => {
  const projectId = "test-project";
  const query = "query { hello }";
  const serviceId = "my-service";
  const serviceInfo = {
    serviceName: `projects/${projectId}/locations/us-central1/services/${serviceId}`,
  };
  const mockClient = new Client({ urlPrefix: "http://localhost" });
  const mockResponse = { body: { data: { hello: "world" } } };
  const mockToolResponse = { isError: false, content: [{ type: "text", text: "{}" }] };
  const mockHost: any = {};
  const mockConfig: any = {};

  let pickServiceStub: sinon.SinonStub;
  let dataplaneClientStub: sinon.SinonStub;
  let emulatorClientStub: sinon.SinonStub;
  let executeGraphQLStub: sinon.SinonStub;
  let parseVariablesStub: sinon.SinonStub;
  let responseToToolResponseStub: sinon.SinonStub;

  beforeEach(() => {
    pickServiceStub = sinon.stub(fileUtils, "pickService");
    dataplaneClientStub = sinon.stub(dataplane, "dataconnectDataplaneClient");
    emulatorClientStub = sinon.stub(emulator, "getDataConnectEmulatorClient");
    executeGraphQLStub = sinon.stub(dataplane, "executeGraphQL");
    parseVariablesStub = sinon.stub(converter, "parseVariables");
    responseToToolResponseStub = sinon.stub(converter, "graphqlResponseToToolResponse");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should execute against production", async () => {
    pickServiceStub.resolves(serviceInfo);
    dataplaneClientStub.returns(mockClient);
    parseVariablesStub.returns({});
    executeGraphQLStub.resolves(mockResponse);
    responseToToolResponseStub.returns(mockToolResponse);

    const result = await (execute_graphql as any)._fn(
      { query, service_id: serviceId, use_emulator: false },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(pickServiceStub).to.be.calledWith(projectId, mockConfig, serviceId);
    expect(dataplaneClientStub).to.be.calledOnce;
    expect(executeGraphQLStub).to.be.calledWith(mockClient, serviceInfo.serviceName, {
      name: "",
      query,
      variables: {},
    });
    expect(responseToToolResponseStub).to.be.calledWith(mockResponse.body);
    expect(result).to.equal(mockToolResponse);
  });

  it("should execute against the emulator", async () => {
    pickServiceStub.resolves(serviceInfo);
    emulatorClientStub.resolves(mockClient);
    executeGraphQLStub.resolves(mockResponse);

    await (execute_graphql as any)._fn(
      { query, service_id: serviceId, use_emulator: true },
      { projectId, config: mockConfig, host: mockHost },
    );

    expect(emulatorClientStub).to.be.calledWith(mockHost);
    expect(dataplaneClientStub).to.not.be.called;
    expect(executeGraphQLStub).to.be.calledWith(
      mockClient,
      serviceInfo.serviceName,
      sinon.match.any,
    );
  });

  it("should re-throw variable parsing errors", async () => {
    const thrownError = new Error("Invalid JSON");
    parseVariablesStub.throws(thrownError);

    await expect(
      (execute_graphql as any)._fn(
        { query, service_id: serviceId, variables: "invalid" },
        { projectId, config: mockConfig, host: mockHost },
      ),
    ).to.be.rejectedWith(thrownError);
  });
});
