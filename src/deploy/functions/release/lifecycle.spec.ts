import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../backend";
import { determineDeploymentDelta, executeLifecycleHooks } from "./lifecycle";
import * as cloudtasks from "../../../gcp/cloudtasks";
import { logger } from "../../../logger";
import * as projects from "../../../management/projects";
import * as computeEngine from "../../../gcp/computeEngine";
import * as utils from "../../../utils";

describe("lifecycle", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(projects, "getProject").resolves({ projectNumber: "123456" } as any);
    sandbox
      .stub(computeEngine, "getDefaultServiceAccount")
      .resolves("123456-compute@developer.gserviceaccount.com");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("determineDeploymentDelta", () => {
    it("returns afterInstall when haveBackend has no endpoints", () => {
      const haveBackend = backend.empty();

      const delta = determineDeploymentDelta(haveBackend);
      expect(delta).to.equal("afterInstall");
    });

    it("returns afterUpdate when haveBackend has existing endpoints", () => {
      const haveBackend = backend.of({
        id: "myFunc",
        project: "myProj",
        region: "us-east1",
        entryPoint: "myFunc",
        platform: "gcfv2",
        httpsTrigger: {},
      });

      const delta = determineDeploymentDelta(haveBackend);
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
        region: "us-east1",
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
      expect(queueName).to.equal("projects/myProj/locations/us-east1/queues/installHookTask");
      expect(task.httpRequest.url).to.equal("https://installhooktask-12345.a.run.app");
      expect(task.httpRequest.httpMethod).to.equal("POST");
      expect(task.httpRequest.body).to.equal(
        Buffer.from(JSON.stringify({ setupVersion: 1 })).toString("base64"),
      );
      expect(task.httpRequest.oidcToken).to.deep.equal({
        serviceAccountEmail: "123456-compute@developer.gserviceaccount.com",
        audience: "https://installhooktask-12345.a.run.app",
      });
      expect(loggerStub).to.have.been.calledWith(
        sinon.match.any,
        "View logs for afterInstall at: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22installHookTask%22%0Aresource.labels.location%3D%22us-east1%22;project=myProj",
      );
      expect(loggerStub).to.have.been.calledWith(
        sinon.match.any,
        "You can retry the lifecycle hook in isolation by running: firebase functions:lifecycle:run afterInstall default",
      );
    });

    it("enqueues task using the endpoint's configured service account when present", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "installHookTask",
        project: "myProj",
        region: "us-east1",
        entryPoint: "installHookTask",
        platform: "gcfv2",
        uri: "https://installhooktask-12345.a.run.app",
        serviceAccount: "custom-sa@myProj.iam.gserviceaccount.com",
        taskQueueTrigger: {},
      });
      wantBackend.lifecycleHooks = {
        afterInstall: {
          task: {
            function: "installHookTask",
          },
        },
      };
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.true;
      expect(enqueueStub).to.have.been.calledOnce;
      const [, task] = enqueueStub.firstCall.args;
      expect(task.httpRequest.oidcToken).to.deep.equal({
        serviceAccountEmail: "custom-sa@myProj.iam.gserviceaccount.com",
        audience: "https://installhooktask-12345.a.run.app",
      });
    });

    it("enqueues task when afterUpdate TaskQueue hook is configured on subsequent update", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "updateHookTask",
        project: "myProj",
        region: "us-east1",
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
        region: "us-east1",
        entryPoint: "existingFunc",
        platform: "gcfv2",
        httpsTrigger: {},
      });

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.true;
      expect(enqueueStub).to.have.been.calledOnce;
      const [queueName, task] = enqueueStub.firstCall.args;
      expect(queueName).to.equal("projects/myProj/locations/us-east1/queues/updateHookTask");
      expect(task.httpRequest.url).to.equal("https://updatehooktask-12345.a.run.app");
      expect(task.httpRequest.httpMethod).to.equal("POST");
      expect(task.httpRequest.body).to.equal(
        Buffer.from(JSON.stringify({ migrationStep: 2 })).toString("base64"),
      );
      expect(task.httpRequest.oidcToken).to.deep.equal({
        serviceAccountEmail: "123456-compute@developer.gserviceaccount.com",
        audience: "https://updatehooktask-12345.a.run.app",
      });
    });

    it("skips afterUpdate hook when deployment plan contains no resource modifications", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const wantBackend = backend.of({
        id: "updateHookTask",
        project: "myProj",
        region: "us-east1",
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
        region: "us-east1",
        entryPoint: "updateHookTask",
        platform: "gcfv2",
        uri: "https://updatehooktask-12345.a.run.app",
        taskQueueTrigger: {},
      });

      const emptyPlan = {
        "default-us-east1-default": {
          endpointsToCreate: [],
          endpointsToUpdate: [],
          endpointsToDelete: [],
          endpointsToSkip: [wantBackend.endpoints["us-east1"]["updateHookTask"]],
        },
      };

      const executed = await executeLifecycleHooks(wantBackend, haveBackend, emptyPlan, "default");
      expect(executed).to.be.false;
      expect(enqueueStub).to.not.have.been.called;
    });

    it("logs a warning and suggest run command when task enqueue fails", async () => {
      sandbox.stub(cloudtasks, "enqueueTask").rejects(new Error("Queue full"));
      const warningStub = sandbox.stub(utils, "logLabeledWarning");
      const bulletStub = sandbox.stub(utils, "logLabeledBullet");
      const wantBackend = backend.of({
        id: "installHookTask",
        project: "myProj",
        region: "us-east1",
        entryPoint: "installHookTask",
        platform: "gcfv2",
        uri: "https://installhooktask-12345.a.run.app",
        taskQueueTrigger: {},
        codebase: "my-codebase",
      });
      wantBackend.lifecycleHooks = {
        afterInstall: {
          task: {
            function: "installHookTask",
          },
        },
      };
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(
        wantBackend,
        haveBackend,
        undefined,
        "my-codebase",
      );
      expect(executed).to.be.false;
      expect(warningStub).to.have.been.calledWith(
        "functions",
        "Failed to execute afterInstall lifecycle hook: Queue full",
      );
      expect(bulletStub).to.have.been.calledWith(
        "functions",
        "You can retry the lifecycle hook in isolation by running: firebase functions:lifecycle:run afterInstall my-codebase",
      );
    });
  });
});
