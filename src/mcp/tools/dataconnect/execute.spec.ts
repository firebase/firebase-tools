import { expect } from "chai";
import * as sinon from "sinon";
import { execute_in_emulator } from "./execute";
import * as dataplane from "../../../dataconnect/dataplaneClient";
import * as load from "../../../dataconnect/load";
import * as emulatorUtil from "../../util/dataconnect/emulator";
import { Client } from "../../../apiv2";

describe("execute_in_emulator tool", () => {
  let sandbox: sinon.SinonSandbox;
  let pickOneServiceStub: sinon.SinonStub;
  let getDataConnectEmulatorClientStub: sinon.SinonStub;
  let executeGraphQLStub: sinon.SinonStub;
  let executeGraphQLReadStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pickOneServiceStub = sandbox.stub(load, "pickOneService").resolves({
      serviceName: "projects/test-project/locations/us-central1/services/my-service",
    } as any);
    getDataConnectEmulatorClientStub = sandbox
      .stub(emulatorUtil, "getDataConnectEmulatorClient")
      .resolves({} as Client);
    executeGraphQLStub = sandbox.stub(dataplane, "executeGraphQL").resolves({
      body: { data: { result: "mutation-success" } },
    } as any);
    executeGraphQLReadStub = sandbox.stub(dataplane, "executeGraphQLRead").resolves({
      body: { data: { result: "query-success" } },
    } as any);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should run query operation with executeGraphQLRead", async () => {
    const result = await execute_in_emulator.fn(
      {
        query: "query MyQuery { foo }",
        variables_json: '{"var": 123}',
      },
      { projectId: "test-project", config: {} } as any,
    );

    expect(pickOneServiceStub.calledOnce).to.be.true;
    expect(getDataConnectEmulatorClientStub.calledOnce).to.be.true;
    expect(executeGraphQLReadStub.calledOnce).to.be.true;
    expect(executeGraphQLStub.called).to.be.false;

    expect(result.isError).to.be.false;
    expect(result.content[0].type).to.equal("text");
    expect((result.content[0] as any).text).to.include("query-success");
  });

  it("should run mutation operation with executeGraphQL", async () => {
    const result = await execute_in_emulator.fn(
      {
        query: "mutation MyMutation { bar }",
      },
      { projectId: "test-project", config: {} } as any,
    );

    expect(pickOneServiceStub.calledOnce).to.be.true;
    expect(getDataConnectEmulatorClientStub.calledOnce).to.be.true;
    expect(executeGraphQLStub.calledOnce).to.be.true;
    expect(executeGraphQLReadStub.called).to.be.false;

    expect(result.isError).to.be.false;
    expect(result.content[0].type).to.equal("text");
    expect((result.content[0] as any).text).to.include("mutation-success");
  });
});
