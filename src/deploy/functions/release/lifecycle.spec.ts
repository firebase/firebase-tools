import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../backend";
import { determineDeploymentDelta, executeLifecycleHooks } from "./lifecycle";
import * as cloudtasks from "../../../gcp/cloudtasks";

describe("lifecycle", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("determineDeploymentDelta", () => {
    it("returns afterInstall when haveBackend has no endpoints", () => {
      const wantBackend = backend.empty();
      const haveBackend = backend.empty();

      const delta = determineDeploymentDelta(wantBackend, haveBackend);
      expect(delta).to.equal("afterInstall");
    });

    it("returns afterUpdate when haveBackend has existing endpoints", () => {
      const wantBackend = backend.empty();
      const haveBackend = backend.of({
        id: "myFunc",
        project: "myProj",
        region: "us-central1",
        entryPoint: "myFunc",
        platform: "gcfv2",
        httpsTrigger: {},
      });

      const delta = determineDeploymentDelta(wantBackend, haveBackend);
      expect(delta).to.equal("afterUpdate");
    });
  });

  describe("executeLifecycleHooks", () => {
    it("returns false if no lifecycle hook is configured for the deployment delta", async () => {
      const wantBackend = backend.empty();
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.false;
    });

    it("enqueues task when afterInstall TaskQueue hook is configured on fresh install", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "installHookTask",
        project: "myProj",
        region: "us-central1",
        entryPoint: "installHookTask",
        platform: "gcfv2",
        uri: "https://installhooktask-12345.a.run.app",
        taskQueueTrigger: {},
      });
      wantBackend.lifecycleHooks = {
        afterInstall: {
          eventType: "afterInstall",
          actionType: "taskQueue",
          target: "installHookTask",
          body: { setupVersion: 1 },
        },
      };
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.true;
      expect(enqueueStub).to.have.been.calledOnce;
      const [queueName, task] = enqueueStub.firstCall.args;
      expect(queueName).to.equal("projects/myProj/locations/us-central1/queues/installHookTask");
      expect(task.httpRequest.url).to.equal("https://installhooktask-12345.a.run.app");
      expect(task.httpRequest.httpMethod).to.equal("POST");
      expect(task.httpRequest.body).to.equal(Buffer.from(JSON.stringify({ setupVersion: 1 })).toString("base64"));
    });
  });
});
