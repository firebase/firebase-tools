import * as sinon from "sinon";
import { expect } from "chai";

import * as gcp from "../../../gcp/frameworks";
import * as repo from "../../../init/features/frameworks/repo";
import * as poller from "../../../operation-poller";
import { createStack, getOrCreateStack } from "../../../init/features/frameworks/index";
import { FirebaseError } from "../../../error";

describe("operationsConverter", () => {
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  let pollOperationStub: sinon.SinonStub;
  let createStackStub: sinon.SinonStub;
  let getStackStub: sinon.SinonStub;
  let linkGitHubRepositoryStub: sinon.SinonStub;

  beforeEach(() => {
    pollOperationStub = sandbox
      .stub(poller, "pollOperation")
      .throws("Unexpected pollOperation call");
    createStackStub = sandbox.stub(gcp, "createStack").throws("Unexpected createStack call");
    getStackStub = sandbox.stub(gcp, "getStack").throws("Unexpected getStack call");
    linkGitHubRepositoryStub = sandbox
      .stub(repo, "linkGitHubRepository")
      .throws("Unexpected getStack call");
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
      labels: {},
    };
    const op = {
      name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
      done: true,
    };
    const completeStack = {
      name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
      labels: {},
      createTime: "0",
      updateTime: "1",
      uri: "https://placeholder.com",
    };

    it("checks is correct arguments are sent & creates a stack", async () => {
      createStackStub.resolves(op);
      pollOperationStub.resolves(completeStack);

      await createStack(projectId, location, stackInput);

      expect(createStackStub).to.be.calledWith(projectId, location, stackInput);
    });

    it("should return an existing stack if useExistingStack is 'yes'", async () => {
      const setup = {
        frameworks: {
          region: location,
          serviceName: stackId,
          useExistingStack: "yes",
        },
      };
      getStackStub.resolves(completeStack);

      const result = await getOrCreateStack("projectId", setup);
      expect(result).to.deep.equal(completeStack);
      expect(getStackStub.calledOnceWithExactly(projectId, location, stackId)).to.be.true;
    });

    it("should create new stack if stack doesn't exist", async () => {
      const stackId = "newStackId";
      const setup = {
        frameworks: {
          region: location,
          serviceName: "newStackId",
          useExistingStack: "yes",
          deployMethod: "github",
        },
      };
      const op = {
        name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
        done: true,
      };
      const completeStack = {
        name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
        labels: {},
        createTime: "0",
        updateTime: "1",
        uri: "https://placeholder.com",
      };
      const cloudBuildConnRepo = {
        name: `projects/${projectId}/locations/${location}/stacks/${stackId}`,
        remoteUri: "remoteUri",
        createTime: "0",
        updateTime: "1",
      };
      const stackInput = {
        name: stackId,
        labels: {},
      };

      getStackStub.throws(new FirebaseError("error", { status: 404 }));
      linkGitHubRepositoryStub.resolves(cloudBuildConnRepo);
      createStackStub.resolves(op);
      pollOperationStub.resolves(completeStack);
      const result = await getOrCreateStack("projectId", setup);
      expect(result).to.deep.equal(completeStack);
      expect(createStackStub).to.be.calledWith(projectId, location, stackInput);
    });
  });
});
