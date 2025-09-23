import { expect } from "chai";
import * as sinon from "sinon";
import * as serviceUsage from "./serviceusage";
import * as poller from "../operation-poller";

describe("serviceusage", () => {
  let postStub: sinon.SinonStub;
  let pollerStub: sinon.SinonStub;

  const projectNumber = "projectNumber";
  const service = "service";
  const prefix = "prefix";

  beforeEach(() => {
    postStub = sinon.stub(serviceUsage.apiClient, "post").throws("unexpected post call");
    pollerStub = sinon.stub(poller, "pollOperation").throws("unexpected pollOperation call");
  });

  afterEach(() => {
    postStub.restore();
    pollerStub.restore();
  });

  describe("generateServiceIdentityAndPoll", () => {
    it("does not poll if generateServiceIdentity responds with a completed operation", async () => {
      postStub.onFirstCall().resolves({ body: { done: true } });
      await serviceUsage.generateServiceIdentityAndPoll(projectNumber, service, prefix);
      expect(pollerStub).to.not.be.called;
    });
  });
});
