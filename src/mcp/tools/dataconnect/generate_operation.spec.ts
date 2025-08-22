import { expect } from "chai";
import * as sinon from "sinon";
import { generate_operation } from "./generate_operation";
import * as fdcExperience from "../../../gemini/fdcExperience";
import * as fileUtils from "../../../dataconnect/fileUtils";
import { toContent } from "../../util";

describe("generate_operation tool", () => {
  const projectId = "test-project";
  const prompt = "generate a query";
  const serviceId = "my-service";
  const serviceName = `projects/${projectId}/locations/us-central1/services/${serviceId}`;
  const serviceInfo = { serviceName };
  const generatedOp = "query { hello }";
  const mockConfig: any = {};

  let pickServiceStub: sinon.SinonStub;
  let generateOperationStub: sinon.SinonStub;

  beforeEach(() => {
    pickServiceStub = sinon.stub(fileUtils, "pickService");
    generateOperationStub = sinon.stub(fdcExperience, "generateOperation");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should generate an operation successfully", async () => {
    pickServiceStub.resolves(serviceInfo);
    generateOperationStub.resolves(generatedOp);

    const result = await (generate_operation as any)._fn(
      { prompt, service_id: serviceId },
      { projectId, config: mockConfig },
    );

    expect(pickServiceStub).to.be.calledWith(projectId, mockConfig, serviceId);
    expect(generateOperationStub).to.be.calledWith(prompt, serviceName, projectId);
    expect(result).to.deep.equal(toContent(generatedOp));
  });
});
