import { expect } from "chai";
import * as sinon from "sinon";
import * as serviceUsage from "./serviceusage";
import * as poller from "../operation-poller";
import * as ensureApiEnabled from "../ensureApiEnabled";

describe("serviceusage", () => {
  let postStub: sinon.SinonStub;
  let pollerStub: sinon.SinonStub;
  let uncacheStub: sinon.SinonStub;

  const projectNumber = "projectNumber";
  const service = "service";
  const prefix = "prefix";

  beforeEach(() => {
    postStub = sinon.stub(serviceUsage.apiClient, "post").throws("unexpected post call");
    pollerStub = sinon.stub(poller, "pollOperation").throws("unexpected pollOperation call");
    uncacheStub = sinon.stub(ensureApiEnabled, "uncacheEnabledAPI");
  });

  afterEach(() => {
    postStub.restore();
    pollerStub.restore();
    uncacheStub.restore();
  });

  describe("generateServiceIdentityAndPoll", () => {
    it("does not poll if generateServiceIdentity responds with a completed operation", async () => {
      postStub.onFirstCall().resolves({ body: { done: true } });
      await serviceUsage.generateServiceIdentityAndPoll(projectNumber, service, prefix);
      expect(pollerStub).to.not.be.called;
    });
  });

  describe("disableServiceAndPoll", () => {
    it("does not poll if disableService responds with a completed operation", async () => {
      postStub.onFirstCall().resolves({ body: { done: true } });
      await serviceUsage.disableServiceAndPoll(projectNumber, service, prefix);
      expect(pollerStub).to.not.be.called;
    });

    it("invalidates the enablement cache for the disabled service", async () => {
      postStub.onFirstCall().resolves({ body: { done: true } });
      await serviceUsage.disableServiceAndPoll(projectNumber, service, prefix);
      expect(uncacheStub).to.have.been.calledOnceWith(projectNumber, service);
    });

    it("polls if disableService responds with an uncompleted operation", async () => {
      postStub.onFirstCall().resolves({ body: { done: false, name: "operation-name" } });
      pollerStub.onFirstCall().resolves({});
      await serviceUsage.disableServiceAndPoll(projectNumber, service, prefix);
      expect(pollerStub).to.have.been.calledOnce;
      expect(pollerStub).to.have.been.calledWithMatch({
        operationResourceName: "operation-name",
      });
    });
  });
});
