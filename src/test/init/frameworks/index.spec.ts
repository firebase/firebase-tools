import * as sinon from "sinon";
import { expect } from "chai";

import * as gcp from "../../../gcp/frameworks";
import * as poller from "../../../operation-poller";
import { getOrCreateStack } from "../../../init/features/frameworks/index";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createStackStub: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createStackStub = sandbox.stub(gcp, "createStack").throws("Unexpected createStack call");
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("createStack", () => {
    const projectId = "projectId";
    const location = "us-central1";
    const stackId = "stackId";
    const stackInput = {
      name: stackId,
      codebase: {
        repository: `projects/${projectId}/locations/${location}/connections/${stackId}`,
        rootDirectory: "/",
      },
      labels: {},
    };
    const op = {
      name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
      done: true,
    };
    const completeStack = {
      name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
      codebase: {
        repository: `projects/${projectId}/locations/${location}/connections/${stackId}`,
        rootDirectory: "/",
      },
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    it("checks is correct arguments are sent & creates a stack", async () => {
      createStackStub.resolves(op);
      pollOperationStub.resolves(completeStack);

      await getOrCreateStack(projectId, location, stackInput);
      expect(createStackStub).to.be.calledWith(projectId, location, stackInput);
    });
  });
});
