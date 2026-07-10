import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../backend";
import {
  determineDeploymentEvent,
  executeLifecycleHooks,
  hasLifecycleHooks,
  isRecoveredFromPartialDeploy,
} from "./lifecycle";
import * as prompts from "../prompts";
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

  describe("isRecoveredFromPartialDeploy", () => {
    it("returns false if wantBackend endpoints have no hashes", () => {
      const wantBackend = backend.of({
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
      });
      const haveBackend = backend.empty();
      expect(isRecoveredFromPartialDeploy(wantBackend, haveBackend)).to.be.false;
    });

    it("returns false if haveBackend does not include the same hash", () => {
      const wantEndpoint: backend.Endpoint = {
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-new",
      };
      const haveEndpoint: backend.Endpoint = { ...wantEndpoint, hash: "hash-old" };
      const wantBackend = backend.of(wantEndpoint);
      const haveBackend = backend.of(haveEndpoint);
      expect(isRecoveredFromPartialDeploy(wantBackend, haveBackend)).to.be.false;
    });

    it("returns false if haveBackend includes the same hash but there are no net new functions", () => {
      const wantEndpoint1: backend.Endpoint = {
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const wantEndpoint2: backend.Endpoint = {
        id: "fn2",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn2",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const haveEndpoint1: backend.Endpoint = { ...wantEndpoint1 };
      const haveEndpoint2: backend.Endpoint = { ...wantEndpoint2, hash: "hash-old" };
      const wantBackend = backend.of(wantEndpoint1, wantEndpoint2);
      const haveBackend = backend.of(haveEndpoint1, haveEndpoint2);
      expect(isRecoveredFromPartialDeploy(wantBackend, haveBackend)).to.be.false;
    });

    it("returns true if haveBackend includes the same hash and there are net new functions", () => {
      const wantEndpoint1: backend.Endpoint = {
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const wantEndpoint2: backend.Endpoint = {
        id: "fn2",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn2",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const haveEndpoint1: backend.Endpoint = { ...wantEndpoint1 };
      const wantBackend = backend.of(wantEndpoint1, wantEndpoint2);
      const haveBackend = backend.of(haveEndpoint1);
      expect(isRecoveredFromPartialDeploy(wantBackend, haveBackend)).to.be.true;
    });

    it("returns true if haveBackend includes the same hash and net new function exists in haveBackend only in FAILED state", () => {
      const wantEndpoint1: backend.Endpoint = {
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const wantEndpoint2: backend.Endpoint = {
        id: "fn2",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn2",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "hash-shared",
      };
      const haveEndpoint1: backend.Endpoint = { ...wantEndpoint1 };
      const haveEndpoint2: backend.Endpoint = { ...wantEndpoint2, state: "FAILED" };
      const wantBackend = backend.of(wantEndpoint1, wantEndpoint2);
      const haveBackend = backend.of(haveEndpoint1, haveEndpoint2);
      expect(isRecoveredFromPartialDeploy(wantBackend, haveBackend)).to.be.true;
    });
  });

  describe("determineDeploymentEvent", () => {
    it("returns afterFirstDeploy when haveBackend has no endpoints", () => {
      const haveBackend = backend.empty();

      const event = determineDeploymentEvent(haveBackend);
      expect(event).to.equal("afterFirstDeploy");
    });

    it("returns afterFirstDeploy when haveBackend has only FAILED endpoints", () => {
      const haveBackend = backend.of({
        id: "myFunc",
        project: "myProj",
        region: "us-east1",
        entryPoint: "myFunc",
        platform: "gcfv2",
        httpsTrigger: {},
        state: "FAILED",
      });

      const event = determineDeploymentEvent(haveBackend);
      expect(event).to.equal("afterFirstDeploy");
    });

    it("returns afterRedeploy when haveBackend has existing endpoints", () => {
      const haveBackend = backend.of({
        id: "myFunc",
        project: "myProj",
        region: "us-east1",
        entryPoint: "myFunc",
        platform: "gcfv2",
        httpsTrigger: {},
      });

      const event = determineDeploymentEvent(haveBackend);
      expect(event).to.equal("afterRedeploy");
    });
  });

  describe("hasLifecycleHooks", () => {
    it("returns false when lifecycleHooks is undefined", () => {
      const b = backend.empty();
      expect(hasLifecycleHooks(b)).to.be.false;
    });

    it("returns false when lifecycleHooks is empty", () => {
      const b = backend.empty();
      b.lifecycleHooks = {};
      expect(hasLifecycleHooks(b)).to.be.false;
    });

    it("returns true when lifecycleHooks has configured hooks", () => {
      const b = backend.empty();
      b.lifecycleHooks = {
        afterFirstDeploy: {
          task: {
            function: "myTask",
          },
        },
      };
      expect(hasLifecycleHooks(b)).to.be.true;
    });
  });

  describe("executeLifecycleHooks", () => {
    it("returns false if no lifecycle hook is configured for the deployment delta", async () => {
      const wantBackend = backend.empty();
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(wantBackend, haveBackend);
      expect(executed).to.be.false;
    });

    it("enqueues task when afterFirstDeploy TaskQueue hook is configured on fresh install", async () => {
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
        afterFirstDeploy: {
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
        "View logs for afterFirstDeploy at: https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%0Aresource.labels.service_name%3D%22installHookTask%22%0Aresource.labels.location%3D%22us-east1%22;project=myProj",
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
        afterFirstDeploy: {
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

    it("enqueues task when afterRedeploy TaskQueue hook is configured on subsequent update", async () => {
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
        afterRedeploy: {
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

    it("skips afterRedeploy hook when deployment plan contains no resource modifications", async () => {
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
        afterRedeploy: {
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
        default: {
          regionalChangesets: {
            "default-us-east1-default": {
              endpointsToCreate: [],
              endpointsToUpdate: [],
              endpointsToDelete: [],
              endpointsToSkip: [wantBackend.endpoints["us-east1"]["updateHookTask"]],
            },
          },
        },
      };

      const executed = await executeLifecycleHooks(
        wantBackend,
        haveBackend,
        emptyPlan /* plan */,
        "default" /* codebase */,
      );
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
        afterFirstDeploy: {
          task: {
            function: "installHookTask",
          },
        },
      };
      const haveBackend = backend.empty();

      const executed = await executeLifecycleHooks(
        wantBackend,
        haveBackend,
        undefined /* plan */,
        "my-codebase" /* codebase */,
      );
      expect(executed).to.be.false;
      expect(warningStub).to.have.been.calledWith(
        "functions",
        "Failed to execute afterFirstDeploy lifecycle hook: Queue full",
      );
      expect(bulletStub).to.have.been.calledWith(
        "functions",
        "You can retry the lifecycle hook in isolation by running: firebase functions:lifecycle:run afterFirstDeploy my-codebase",
      );
    });

    it("prompts user and executes selected hook when recovering from a partial deployment", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const promptStub = sandbox
        .stub(prompts, "promptForLifecycleEvent")
        .resolves("afterFirstDeploy");
      const wantBackend = backend.of(
        {
          id: "fn1",
          project: "myProj",
          region: "us-east1",
          entryPoint: "fn1",
          platform: "gcfv2" as const,
          httpsTrigger: {},
          hash: "shared-hash",
        },
        {
          id: "installHookTask",
          project: "myProj",
          region: "us-east1",
          entryPoint: "installHookTask",
          platform: "gcfv2" as const,
          uri: "https://installhooktask-12345.a.run.app",
          taskQueueTrigger: {},
          hash: "shared-hash",
        },
      );
      wantBackend.lifecycleHooks = {
        afterFirstDeploy: {
          task: {
            function: "installHookTask",
          },
        },
      };
      const haveBackend = backend.of({
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "shared-hash",
      });

      const executed = await executeLifecycleHooks(
        wantBackend,
        haveBackend,
        undefined /* plan */,
        "default" /* codebase */,
        undefined /* options */,
      );
      expect(promptStub).to.have.been.calledOnceWith("default", wantBackend, sinon.match.any);
      expect(executed).to.be.true;
      expect(enqueueStub).to.have.been.calledOnce;
    });

    it("skips execution when user selects skip in partial deployment recovery prompt", async () => {
      const enqueueStub = sandbox.stub(cloudtasks, "enqueueTask").resolves();
      const promptStub = sandbox.stub(prompts, "promptForLifecycleEvent").resolves(undefined);
      const bulletStub = sandbox.stub(utils, "logLabeledBullet");
      const wantBackend = backend.of(
        {
          id: "fn1",
          project: "myProj",
          region: "us-east1",
          entryPoint: "fn1",
          platform: "gcfv2" as const,
          httpsTrigger: {},
          hash: "shared-hash",
        },
        {
          id: "installHookTask",
          project: "myProj",
          region: "us-east1",
          entryPoint: "installHookTask",
          platform: "gcfv2" as const,
          uri: "https://installhooktask-12345.a.run.app",
          taskQueueTrigger: {},
          hash: "shared-hash",
        },
      );
      wantBackend.lifecycleHooks = {
        afterFirstDeploy: {
          task: {
            function: "installHookTask",
          },
        },
      };
      const haveBackend = backend.of({
        id: "fn1",
        project: "myProj",
        region: "us-east1",
        entryPoint: "fn1",
        platform: "gcfv2" as const,
        httpsTrigger: {},
        hash: "shared-hash",
      });

      const executed = await executeLifecycleHooks(
        wantBackend,
        haveBackend,
        undefined /* plan */,
        "default" /* codebase */,
        undefined /* options */,
      );
      expect(promptStub).to.have.been.calledOnce;
      expect(executed).to.be.false;
      expect(enqueueStub).to.not.have.been.called;
      expect(bulletStub).to.have.been.calledWith(
        "functions",
        sinon.match(/Skipping lifecycle hooks for codebase "default"/),
      );
    });
  });
});
