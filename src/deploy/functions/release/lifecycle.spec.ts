import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../backend";
import { determineDeploymentDelta, executeLifecycleHooks } from "./lifecycle";
import * as cloudtasks from "../../../gcp/cloudtasks";
import { logger } from "../../../logger";
import * as getProjectNumber from "../../../getProjectNumber";
import * as computeEngine from "../../../gcp/computeEngine";

describe("lifecycle", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(getProjectNumber, "getProjectNumber").resolves("123456");
    sandbox
      .stub(computeEngine, "getDefaultServiceAccount")
      .resolves("123456-compute@developer.gserviceaccount.com");
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
      const loggerStub = sandbox.stub(logger, "info");
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
          task: {
            function: "installHookTask",
            body: { setupVersion: 1 },
          },
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
      expect(task.httpRequest.body).to.equal(
        Buffer.from(JSON.stringify({ setupVersion: 1 })).toString("base64"),
      );
      expect(task.httpRequest.oidcToken).to.deep.equal({
        serviceAccountEmail: "123456-compute@developer.gserviceaccount.com",
      });
      expect(loggerStub).to.have.been.calledWith(
        sinon.match.any,
        "View logs for installHookTask at: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22installHookTask%22%0Aresource.labels.location%3D%22us-central1%22;project=myProj",
      );
    });

    it("enqueues task when afterUpdate TaskQueue hook is configured on subsequent update", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "updateHookTask",
        project: "myProj",
        region: "us-central1",
        entryPoint: "updateHookTask",
        platform: "gcfv2",
        uri: "https://updatehooktask-12345.a.run.app",
        taskQueueTrigger: {},
      });
      wantBackend.lifecycleHooks = {
        afterUpdate: {
          task: {
            function: "updateHookTask",
            body: { migrationStep: 2 },
          },
        },
      };
      const haveBackend = backend.of({
        id: "existingFunc",
        project: "myProj",
        region: "us-central1",
        entryPoint: "existingFunc",
        platform: "gcfv2",
        httpsTrigger: {},
      });

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.true;
      expect(enqueueStub).to.have.been.calledOnce;
      const [queueName, task] = enqueueStub.firstCall.args;
      expect(queueName).to.equal("projects/myProj/locations/us-central1/queues/updateHookTask");
      expect(task.httpRequest.url).to.equal("https://updatehooktask-12345.a.run.app");
      expect(task.httpRequest.httpMethod).to.equal("POST");
      expect(task.httpRequest.body).to.equal(
        Buffer.from(JSON.stringify({ migrationStep: 2 })).toString("base64"),
      );
      expect(task.httpRequest.oidcToken).to.deep.equal({
        serviceAccountEmail: "123456-compute@developer.gserviceaccount.com",
      });
    });

    it("skips afterUpdate hook when deployment plan contains no resource modifications", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "updateHookTask",
        project: "myProj",
        region: "us-central1",
        entryPoint: "updateHookTask",
        platform: "gcfv2",
        uri: "https://updatehooktask-12345.a.run.app",
        taskQueueTrigger: {},
      });
      wantBackend.lifecycleHooks = {
        afterUpdate: {
          task: {
            function: "updateHookTask",
          },
        },
      };
      const haveBackend = backend.of({
        id: "updateHookTask",
        project: "myProj",
        region: "us-central1",
        entryPoint: "updateHookTask",
        platform: "gcfv2",
        uri: "https://updatehooktask-12345.a.run.app",
        taskQueueTrigger: {},
      });

      const emptyPlan = {
        "default-us-central1-default": {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [],
          endpointsToSkip: [wantBackend.endpoints["us-central1"]["updateHookTask"]],
        },
      };

      const executed = await executeLifecycleHooks(wantBackend, haveBackend, emptyPlan, "default");
      expect(executed).to.be.false;
      expect(enqueueStub).to.not.have.been.called;
    });
  });
});
