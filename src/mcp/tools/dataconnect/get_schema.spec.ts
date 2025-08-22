import { expect } from "chai";
import * as sinon from "sinon";
import { get_schema } from "./get_schema";
import * as client from "../../../dataconnect/client";
import * as fileUtils from "../../../dataconnect/fileUtils";
import * as converter from "./converter";
import { toContent } from "../../util";

describe("get_schema tool", () => {
  const projectId = "test-project";
  const serviceId = "my-service";
  const serviceName = `projects/${projectId}/locations/us-central1/services/${serviceId}`;
  const serviceInfo = { serviceName };
  const schemas = [{ name: "s1" }, { name: "s2" }];
  const formattedSchemas = ["formatted_s1", "formatted_s2"];
  const mockConfig: any = {};

  let pickServiceStub: sinon.SinonStub;
  let listSchemasStub: sinon.SinonStub;
  let schemaToTextStub: sinon.SinonStub;

  beforeEach(() => {
    pickServiceStub = sinon.stub(fileUtils, "pickService");
    listSchemasStub = sinon.stub(client, "listSchemas");
    schemaToTextStub = sinon.stub(converter, "schemaToText");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should get schemas successfully", async () => {
    pickServiceStub.resolves(serviceInfo);
    listSchemasStub.resolves(schemas as any);
    schemaToTextStub.onFirstCall().returns(formattedSchemas[0]);
    schemaToTextStub.onSecondCall().returns(formattedSchemas[1]);

    const result = await (get_schema as any)._fn(
      { service_id: serviceId },
      { projectId, config: mockConfig },
    );

    expect(pickServiceStub).to.be.calledWith(projectId, mockConfig, serviceId);
    expect(listSchemasStub).to.be.calledWith(serviceName, ["*"]);
    expect(schemaToTextStub).to.be.calledTwice;
    expect(result).to.deep.equal(toContent(formattedSchemas.join("\n\n")));
  });

  it("should handle no schemas found", async () => {
    pickServiceStub.resolves(serviceInfo);
    listSchemasStub.resolves([]);

    const result = await (get_schema as any)._fn(
      { service_id: serviceId },
      { projectId, config: mockConfig },
    );

    expect(result).to.deep.equal(toContent(""));
  });
});
