import { expect } from "chai";
import * as sinon from "sinon";
import { list_services } from "./list_services";
import * as client from "../../../dataconnect/client";
import { toContent } from "../../util";

describe("list_services tool", () => {
  const projectId = "test-project";
  const services = [{ name: "s1" }, { name: "s2" }];

  let listAllServicesStub: sinon.SinonStub;

  beforeEach(() => {
    listAllServicesStub = sinon.stub(client, "listAllServices");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list services successfully", async () => {
    listAllServicesStub.resolves(services as any);

    const result = await (list_services as any)._fn({}, { projectId });

    expect(listAllServicesStub).to.be.calledWith(projectId);
    expect(result).to.deep.equal(toContent(services, { format: "yaml" }));
  });
});
