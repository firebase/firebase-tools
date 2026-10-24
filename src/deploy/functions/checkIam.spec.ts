import { expect } from "chai";
import * as sinon from "sinon";
import * as checkIam from "./checkIam";
import * as storage from "../../gcp/storage";
import * as rm from "../../gcp/resourceManager";
import * as backend from "./backend";

const projectId = "my-project";
const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

const BINDING = {
  role: "some/role",
  members: ["someuser"],
};

const SPEC = {
  region: "us-west1",
  project: projectNumber,
  runtime: "nodejs14" as const,
};

describe("checkIam", () => {
  let storageStub: sinon.SinonStub;
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;

  beforeEach(() => {
    storageStub = sinon
      .stub(storage, "getServiceAccount")
      .throws("unexpected call to storage.getServiceAccount");
    getIamStub = sinon
      .stub(rm, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(rm, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("obtainPubSubServiceAgentBindings", () => {
    it("should obtain the bindings", () => {
      const bindings = checkIam.obtainPubSubServiceAgentBindings(projectNumber);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: [`serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`],
      });
    });
  });

  describe("obtainEventArcServiceAccountBindings", () => {
    it("should return empty bindings when no event-triggered v2 functions", async () => {
      const httpsFn: backend.Endpoint = {
        id: "httpsfn",
        entryPoint: "httpsFn",
        platform: "gcfv2",
        httpsTrigger: {},
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(httpsFn),
      );

      expect(bindings).to.deep.equal([]);
    });

    it("should obtain bindings for default service account", async () => {
      const eventFn: backend.Endpoint = {
        id: "eventfn",
        entryPoint: "eventFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(eventFn),
      );

      expect(bindings.length).to.equal(2);
      expect(bindings).to.include.deep.members([
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
      ]);
    });

    it("should obtain bindings for custom service account", async () => {
      const customSA = "custom-sa@my-project.iam.gserviceaccount.com";
      const eventFn: backend.Endpoint = {
        id: "eventfn",
        entryPoint: "eventFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        serviceAccount: customSA,
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(eventFn),
      );

      expect(bindings.length).to.equal(2);
      expect(bindings).to.include.deep.members([
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [`serviceAccount:${customSA}`],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [`serviceAccount:${customSA}`],
        },
      ]);
    });

    it("should handle multiple service accounts", async () => {
      const customSA1 = "custom-sa1@my-project.iam.gserviceaccount.com";
      const customSA2 = "custom-sa2@my-project.iam.gserviceaccount.com";
      
      const fn1: backend.Endpoint = {
        id: "fn1",
        entryPoint: "fn1",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "bucket1" },
          retry: false,
        },
        serviceAccount: customSA1,
        ...SPEC,
      };
      
      const fn2: backend.Endpoint = {
        id: "fn2",
        entryPoint: "fn2",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: { database: "default" },
          retry: false,
        },
        serviceAccount: customSA2,
        ...SPEC,
      };
      
      const fn3: backend.Endpoint = {
        id: "fn3",
        entryPoint: "fn3",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.firebase.database.ref.v1.written",
          eventFilters: { instance: "default" },
          retry: false,
        },
        // Uses default service account
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(fn1, fn2, fn3),
      );

      expect(bindings.length).to.equal(2);
      expect(bindings).to.include.deep.members([
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [
            `serviceAccount:${customSA1}`,
            `serviceAccount:${customSA2}`,
            `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
          ],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [
            `serviceAccount:${customSA1}`,
            `serviceAccount:${customSA2}`,
            `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
          ],
        },
      ]);
    });

    it("should ignore scheduled functions", async () => {
      const scheduledFn: backend.Endpoint = {
        id: "scheduledfn",
        entryPoint: "scheduledFn",
        platform: "gcfv2",
        scheduleTrigger: {
          schedule: "every 5 minutes",
        },
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(scheduledFn),
      );

      expect(bindings).to.deep.equal([]);
    });

    it("should ignore v1 functions", async () => {
      const v1Fn: backend.Endpoint = {
        id: "v1fn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      const bindings = await checkIam.obtainEventArcServiceAccountBindings(
        projectNumber,
        backend.of(v1Fn),
      );

      expect(bindings).to.deep.equal([]);
    });
  });

  describe("ensureServiceAgentRoles", () => {
    it("should return early if we do not have new services", async () => {
      const v1EventFn: backend.Endpoint = {
        id: "v1eventfn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: { resource: "projects/_/buckets/my-bucket" },
          retry: false,
        },
        ...SPEC,
      };
      const v2CallableFn: backend.Endpoint = {
        id: "v2callablefn",
        entryPoint: "v2callablefn",
        platform: "gcfv2",
        httpsTrigger: {},
        ...SPEC,
      };
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.of(v1EventFn, v2CallableFn, wantFn),
      );

      expect(storageStub).to.not.have.been.called;
      expect(getIamStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should return early if we fail to get the IAM policy", async () => {
      storageStub.resolves(STORAGE_RES);
      getIamStub.rejects("Failed to get the IAM policy");
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await expect(
        checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
        ),
      ).to.not.be.rejected;
      expect(storageStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.not.have.been.called;
    });

    it("should error if we fail to set the IAM policy", async () => {
      storageStub.resolves(STORAGE_RES);
      getIamStub.resolves({
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      });
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await expect(
        checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
        ),
      ).to.be.rejectedWith(
        "We failed to modify the IAM policy for the project. The functions " +
          "deployment requires specific roles to be granted to service agents," +
          " otherwise the deployment will fail.",
      );
      expect(storageStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.have.been.calledOnce;
    });

    it("should add the pubsub publisher role and all default bindings for a new v2 storage function without v2 deployed functions", async () => {
      const newIamPolicy = {
        etag: "etag",
        version: 3,
        bindings: [
          BINDING,
          {
            role: "roles/pubsub.publisher",
            members: [`serviceAccount:${STORAGE_RES.email_address}`],
          },
          {
            role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
            members: [
              `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
            ],
          },
          {
            role: checkIam.RUN_INVOKER_ROLE,
            members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
          },
          {
            role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
            members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
          },
        ],
      };
      storageStub.resolves(STORAGE_RES);
      getIamStub.resolves({
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      });
      setIamStub.resolves(newIamPolicy);
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.empty(),
      );

      expect(storageStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
    });
  });

  describe("ensureGenkitMonitoringRoles", () => {
    it("should return early if we do not have new endpoints", async () => {
      const fn1: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "genkitFn1",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const fn2: backend.Endpoint = {
        id: "genkitFn2",
        platform: "gcfv2",
        entryPoint: "genkitFn2",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const wantFn: backend.Endpoint = {
        id: "wantGenkitFnFn",
        entryPoint: "wantGenkitFn",
        platform: "gcfv2",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await checkIam.ensureGenkitMonitoringRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.of(fn1, fn2, wantFn),
      );

      expect(getIamStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should return early if none of the new endpoints are genkit", async () => {
      const fn1: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "genkitFn1",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const fn2: backend.Endpoint = {
        id: "genkitFn2",
        platform: "gcfv2",
        entryPoint: "genkitFn2",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const wantFn1: backend.Endpoint = {
        id: "wantFn1",
        entryPoint: "wantFn1",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: { bucket: "my-bucket" },
          retry: false,
        },
        ...SPEC,
      };
      const wantFn2: backend.Endpoint = {
        id: "wantFn2",
        entryPoint: "wantFn2",
        platform: "gcfv2",
        callableTrigger: {},
        ...SPEC,
      };

      await checkIam.ensureGenkitMonitoringRoles(
        projectId,
        projectNumber,
        backend.of(wantFn1, wantFn2),
        backend.of(fn1, fn2),
      );

      expect(getIamStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should return early if we fail to get the IAM policy", async () => {
      getIamStub.rejects("Failed to get the IAM policy");
      const wantFn: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "wantFn",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await expect(
        checkIam.ensureGenkitMonitoringRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
        ),
      ).to.not.be.rejected;
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.not.have.been.called;
    });

    it("should error if we fail to set the IAM policy", async () => {
      getIamStub.resolves({
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      });
      const wantFn: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "wantFn",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await expect(
        checkIam.ensureGenkitMonitoringRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
        ),
      ).to.be.rejectedWith(
        "We failed to modify the IAM policy for the project. The functions " +
          "deployment requires specific roles to be granted to service agents," +
          " otherwise the deployment will fail.",
      );
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.have.been.calledOnce;
    });

    it("should not update policy if it already has necessary bindings", async () => {
      const serviceAccount = `test-sa@${projectId}.iam.gserviceaccount.com`;
      const iamPolicy = {
        etag: "etag",
        version: 3,
        bindings: [
          BINDING,
          {
            role: "roles/monitoring.metricWriter",
            members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
          },
          {
            role: "roles/cloudtrace.agent",
            members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
          },
          {
            role: "roles/logging.logWriter",
            members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
          },
        ],
      };
      getIamStub.resolves(iamPolicy);
      const wantFn: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "wantFn",
        serviceAccount: serviceAccount,
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await checkIam.ensureGenkitMonitoringRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.empty(),
      );

      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.not.have.been.called;
    });

    it("should update policy if any bindings are missing", async () => {
      const serviceAccount = `test-sa@${projectId}.iam.gserviceaccount.com`;
      const initialPolicy = {
        etag: "etag",
        version: 3,
        bindings: [
          BINDING,
          {
            role: "roles/monitoring.metricWriter",
            members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
          },
          {
            role: "roles/logging.logWriter",
            members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
          },
        ],
      };
      getIamStub.resolves(initialPolicy);
      setIamStub.resolves({});
      const wantFn: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "wantFn",
        serviceAccount: serviceAccount,
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await checkIam.ensureGenkitMonitoringRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.empty(),
      );

      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledWith(
        projectNumber,
        {
          etag: "etag",
          version: 3,
          bindings: [
            BINDING,
            {
              role: "roles/monitoring.metricWriter",
              members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
            },
            {
              role: "roles/logging.logWriter",
              members: [`serviceAccount:${serviceAccount}`, "anotheruser"],
            },
            // Should include this missing binding
            {
              role: "roles/cloudtrace.agent",
              members: [`serviceAccount:${serviceAccount}`],
            },
          ],
        },
        "bindings",
      );
    });

    it("should update policy for all missing roles and service accounts", async () => {
      const serviceAccount1 = `test-sa-1@${projectId}.iam.gserviceaccount.com`;
      const serviceAccount2 = `test-sa-2@${projectId}.iam.gserviceaccount.com`;
      const defaultServiceAccount = `${projectNumber}-compute@developer.gserviceaccount.com`;
      const initialPolicy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };
      getIamStub.resolves(initialPolicy);
      setIamStub.resolves({});
      const fn1: backend.Endpoint = {
        id: "genkitFn1",
        platform: "gcfv2",
        entryPoint: "wantFn1",
        serviceAccount: serviceAccount1,
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const fn2: backend.Endpoint = {
        id: "genkitFn2",
        platform: "gcfv2",
        entryPoint: "wantFn2",
        serviceAccount: serviceAccount1,
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const fn3: backend.Endpoint = {
        id: "genkitFn3",
        platform: "gcfv2",
        entryPoint: "wantFn3",
        serviceAccount: serviceAccount2,
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };
      const fn4: backend.Endpoint = {
        id: "genkitFnWithDefaultServiceAccount",
        platform: "gcfv2",
        entryPoint: "wantFn",
        callableTrigger: {
          genkitAction: "action",
        },
        ...SPEC,
      };

      await checkIam.ensureGenkitMonitoringRoles(
        projectId,
        projectNumber,
        backend.of(fn1, fn2, fn3, fn4),
        backend.empty(),
      );

      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(setIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledWith(
        projectNumber,
        {
          etag: "etag",
          version: 3,
          bindings: [
            BINDING,
            {
              role: "roles/monitoring.metricWriter",
              members: [
                `serviceAccount:${serviceAccount1}`,
                `serviceAccount:${serviceAccount2}`,
                `serviceAccount:${defaultServiceAccount}`,
              ],
            },
            {
              role: "roles/cloudtrace.agent",
              members: [
                `serviceAccount:${serviceAccount1}`,
                `serviceAccount:${serviceAccount2}`,
                `serviceAccount:${defaultServiceAccount}`,
              ],
            },
            {
              role: "roles/logging.logWriter",
              members: [
                `serviceAccount:${serviceAccount1}`,
                `serviceAccount:${serviceAccount2}`,
                `serviceAccount:${defaultServiceAccount}`,
              ],
            },
          ],
        },
        "bindings",
      );
    });
  });

  it("should add the pubsub publisher role for a new v2 storage function with v2 deployed functions", async () => {
    const newIamPolicy = {
      etag: "etag",
      version: 3,
      bindings: [
        BINDING,
        {
          role: "roles/pubsub.publisher",
          members: [`serviceAccount:${STORAGE_RES.email_address}`],
        },
      ],
    };
    storageStub.resolves(STORAGE_RES);
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [BINDING],
    });
    setIamStub.resolves(newIamPolicy);
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: { bucket: "my-bucket" },
        retry: false,
      },
      ...SPEC,
    };
    const haveFn: backend.Endpoint = {
      id: "haveFn",
      entryPoint: "haveFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.firebasealerts.alerts.v1.published",
        eventFilters: { alertype: "crashlytics.newFatalIssue" },
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.of(haveFn),
    );

    expect(storageStub).to.have.been.calledOnce;
    expect(getIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
  });

  it("should add the default bindings for a new v2 alerts function without v2 deployed functions", async () => {
    const newIamPolicy = {
      etag: "etag",
      version: 3,
      bindings: [
        BINDING,
        {
          role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
          members: [
            `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
          ],
        },
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
      ],
    };
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [BINDING],
    });
    setIamStub.resolves(newIamPolicy);
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.firebasealerts.alerts.v1.published",
        eventFilters: { alertype: "crashlytics.newFatalIssue" },
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.empty(),
    );

    expect(getIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
  });

  it("should not add bindings for a new v2 alerts function with v2 deployed functions", async () => {
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.firebasealerts.alerts.v1.published",
        eventFilters: { alertype: "crashlytics.newFatalIssue" },
        retry: false,
      },
      ...SPEC,
    };
    const haveFn: backend.Endpoint = {
      id: "haveFn",
      entryPoint: "haveFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: { bucket: "my-bucket" },
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.of(haveFn),
    );

    expect(getIamStub).to.not.have.been.called;
    expect(setIamStub).to.not.have.been.called;
  });

  it("should add the default bindings for a new v2 remote config function without v2 deployed functions", async () => {
    const newIamPolicy = {
      etag: "etag",
      version: 3,
      bindings: [
        BINDING,
        {
          role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
          members: [
            `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
          ],
        },
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
      ],
    };
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [BINDING],
    });
    setIamStub.resolves(newIamPolicy);
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.remoteconfig.remoteConfig.v1.updated",
        eventFilters: {},
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.empty(),
    );

    expect(getIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
  });

  it("should not add bindings for a new v2 remote config function with v2 deployed functions", async () => {
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.remoteconfig.remoteConfig.v1.updated",
        eventFilters: {},
        retry: false,
      },
      ...SPEC,
    };
    const haveFn: backend.Endpoint = {
      id: "haveFn",
      entryPoint: "haveFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: { bucket: "my-bucket" },
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.of(haveFn),
    );

    expect(getIamStub).to.not.have.been.called;
    expect(setIamStub).to.not.have.been.called;
  });

  it("should add the default bindings for a new v2 test lab function without v2 deployed functions", async () => {
    const newIamPolicy = {
      etag: "etag",
      version: 3,
      bindings: [
        BINDING,
        {
          role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
          members: [
            `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
          ],
        },
        {
          role: checkIam.RUN_INVOKER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
        {
          role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
          members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
        },
      ],
    };
    getIamStub.resolves({
      etag: "etag",
      version: 3,
      bindings: [BINDING],
    });
    setIamStub.resolves(newIamPolicy);
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.testlab.testMatrix.v1.completed",
        eventFilters: {},
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.empty(),
    );

    expect(getIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledOnce;
    expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
  });

  it("should not add bindings for a new v2 test lab function with v2 deployed functions", async () => {
    const wantFn: backend.Endpoint = {
      id: "wantFn",
      entryPoint: "wantFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.firebase.testlab.testMatrix.v1.completed",
        eventFilters: {},
        retry: false,
      },
      ...SPEC,
    };
    const haveFn: backend.Endpoint = {
      id: "haveFn",
      entryPoint: "haveFn",
      platform: "gcfv2",
      eventTrigger: {
        eventType: "google.cloud.storage.object.v1.finalized",
        eventFilters: { bucket: "my-bucket" },
        retry: false,
      },
      ...SPEC,
    };

    await checkIam.ensureServiceAgentRoles(
      projectId,
      projectNumber,
      backend.of(wantFn),
      backend.of(haveFn),
    );

    expect(getIamStub).to.not.have.been.called;
    expect(setIamStub).to.not.have.been.called;
  });
});
