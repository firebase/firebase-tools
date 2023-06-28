import * as sinon from "sinon";
import { expect } from "chai";

import * as rpc from "../../../api/frameworks/rpcHandler";
import * as poller from "../../../operation-poller";
import * as utils from "../../../utils";
import { createStack } from "../../../api/frameworks/operationsCoverter";

describe("composer", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createStackStub: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createStackStub = sandbox.stub(rpc, "createStack").throws("Unexpected createStack call");

    sandbox.stub(utils, "openInBrowser").resolves();
  });

  afterEach(() => {
    sandbox.verifyAndRestore();
  });

  describe("createStackInCloudBuild", () => {
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

    it("create a stack", async () => {
      createStackStub.resolves(op);
      pollOperationStub.resolves(completeStack);

      await createStack(projectId, location, stackInput);
      expect(createStackStub).to.be.calledWith(projectId, location, stackInput);
    });
  });
});
