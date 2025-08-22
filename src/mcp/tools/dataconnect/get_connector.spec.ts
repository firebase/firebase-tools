import { expect } from "chai";
import * as sinon from "sinon";
import { get_connectors } from "./get_connector";
import * as client from "../../../dataconnect/client";
import * as fileUtils from "../../../dataconnect/fileUtils";
import * as converter from "./converter";
import { toContent } from "../../util";

describe("get_connectors tool", () => {
  const projectId = "test-project";
  const serviceId = "my-service";
  const serviceName = `projects/${projectId}/locations/us-central1/services/${serviceId}`;
  const serviceInfo = { serviceName };
  const connectors = [{ name: "c1" }, { name: "c2" }];
  const formattedConnectors = ["formatted_c1", "formatted_c2"];
  const mockConfig: any = {};

  let pickServiceStub: sinon.SinonStub;
  let listConnectorsStub: sinon.SinonStub;
  let connectorToTextStub: sinon.SinonStub;

  beforeEach(() => {
    pickServiceStub = sinon.stub(fileUtils, "pickService");
    listConnectorsStub = sinon.stub(client, "listConnectors");
    connectorToTextStub = sinon.stub(converter, "connectorToText");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get connectors successfully", async () => {
    pickServiceStub.resolves(serviceInfo);
    listConnectorsStub.resolves(connectors as any);
    connectorToTextStub.onFirstCall().returns(formattedConnectors[0]);
    connectorToTextStub.onSecondCall().returns(formattedConnectors[1]);

    const result = await (get_connectors as any)._fn(
      { service_id: serviceId },
      { projectId, config: mockConfig },
    );

    expect(pickServiceStub).to.be.calledWith(projectId, mockConfig, serviceId);
    expect(listConnectorsStub).to.be.calledWith(serviceName, ["*"]);
    expect(connectorToTextStub).to.be.calledTwice;
    expect(result).to.deep.equal(toContent(formattedConnectors.join("\n\n")));
  });
});
