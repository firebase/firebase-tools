import { expect } from "chai";
import * as sinon from "sinon";
import { list_backends } from "./list_backends";
import * as apphosting from "../../../gcp/apphosting";
import { toContent } from "../../util";

describe("list_backends tool", () => {
  const projectId = "test-project";
  const location = "us-central1";
  const backendId = "test-backend";

  let listBackendsStub: sinon.SinonStub;
  let getTrafficStub: sinon.SinonStub;
  let listDomainsStub: sinon.SinonStub;
  let parseBackendNameStub: sinon.SinonStub;

  beforeEach(() => {
    listBackendsStub = sinon.stub(apphosting, "listBackends");
    getTrafficStub = sinon.stub(apphosting, "getTraffic");
    listDomainsStub = sinon.stub(apphosting, "listDomains");
    parseBackendNameStub = sinon.stub(apphosting, "parseBackendName");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return a message when no backends are found", async () => {
    listBackendsStub.resolves({ backends: [] });

    const result = await list_backends.fn({ location }, { projectId } as any);

    expect(listBackendsStub).to.be.calledWith(projectId, location);
    expect(result).to.deep.equal(
      toContent(`No backends exist for project ${projectId} in ${location}.`),
    );
  });

  it("should list backends with traffic and domain info", async () => {
    const backend = { name: `projects/${projectId}/locations/${location}/backends/${backendId}` };
    const backends = { backends: [backend] };
    const traffic = { name: "traffic" };
    const domains = [{ name: "domain" }];

    listBackendsStub.resolves(backends);
    parseBackendNameStub.returns({ location, id: backendId });
    getTrafficStub.resolves(traffic);
    listDomainsStub.resolves(domains);

    const result = await list_backends.fn({ location }, { projectId } as any);

    expect(listBackendsStub).to.be.calledWith(projectId, location);
    expect(parseBackendNameStub).to.be.calledWith(backend.name);
    expect(getTrafficStub).to.be.calledWith(projectId, location, backendId);
    expect(listDomainsStub).to.be.calledWith(projectId, location, backendId);

    const expectedData = [{ ...backend, traffic, domains }];
    expect(result).to.deep.equal(toContent(expectedData));
  });

  it("should handle the default location", async () => {
    listBackendsStub.resolves({ backends: [] });
    await list_backends.fn({}, { projectId } as any);
    expect(listBackendsStub).to.be.calledWith(projectId, "-");
  });
});
