import { expect } from "chai";
import * as sinon from "sinon";
import * as checkIam from "./checkIam";
import * as storage from "../../gcp/storage";
import * as rm from "../../gcp/resourceManager";
import * as backend from "./backend";
import * as iam from "../../gcp/iam";
import * as gce from "../../gcp/computeEngine";
import { FirebaseError } from "../../error";
import * as utils from "../../utils";

const projectId = "my-project";
const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

const DEFAULT_SA = `${projectNumber}-compute@developer.gserviceaccount.com`;
const CUSTOM_SA = `custom-sa@${projectId}.iam.gserviceaccount.com`;

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
  let getServiceAccountStub: sinon.SinonStub;

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
    getServiceAccountStub = sinon
      .stub(iam, "getServiceAccount")
      .resolves({ email: DEFAULT_SA } as iam.ServiceAccount);
    sinon.stub(gce, "getDefaultServiceAccount").resolves(DEFAULT_SA);
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

  describe("obtainDefaultComputeServiceAgentBindings", () => {
    it("should obtain the bindings", async () => {
      const bindings = await checkIam.obtainDefaultComputeServiceAgentBindings(projectNumber);

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

    describe("when the default compute service account does not exist", () => {
      const ALERTS_TRIGGER = {
        eventType: "google.firebase.firebasealerts.alerts.v1.published",
        eventFilters: { alertype: "crashlytics.newFatalIssue" },
        retry: false,
      };
      const PUBSUB_TOKEN_CREATOR = {
        role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: [`serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`],
      };
      let warnStub: sinon.SinonStub;

      beforeEach(() => {
        getServiceAccountStub.rejects(new FirebaseError("not found", { status: 404 }));
        warnStub = sinon.stub(utils, "logLabeledWarning");
        getIamStub.resolves({ etag: "etag", version: 3, bindings: [BINDING] });
      });

      it("should skip the default account's bindings when every v2 event function sets a service account", async () => {
        setIamStub.resolves({});
        const wantFn: backend.Endpoint = {
          id: "wantFn",
          entryPoint: "wantFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
        );

        expect(getServiceAccountStub).to.have.been.calledOnceWithExactly(projectId, DEFAULT_SA);
        expect(setIamStub).to.have.been.calledOnceWithExactly(
          projectNumber,
          { etag: "etag", version: 3, bindings: [BINDING, PUBSUB_TOKEN_CREATOR] },
          "bindings",
        );
        expect(warnStub).to.have.been.calledWithMatch("functions", DEFAULT_SA);
      });

      it("should print the bindings for the functions' service accounts, expanding shorthand", async () => {
        setIamStub.resolves({});
        const shorthandFn: backend.Endpoint = {
          id: "shorthandFn",
          entryPoint: "shorthandFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: "custom-sa@",
          ...SPEC,
        };
        const fullFn: backend.Endpoint = {
          id: "fullFn",
          entryPoint: "fullFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };
        const printStub = sinon.stub(iam, "printManualIamConfig");

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(shorthandFn, fullFn),
          backend.empty(),
        );

        expect(printStub).to.have.been.calledOnceWithExactly(
          [
            { role: checkIam.RUN_INVOKER_ROLE, members: [`serviceAccount:${CUSTOM_SA}`] },
            {
              role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
              members: [`serviceAccount:${CUSTOM_SA}`],
            },
          ],
          projectId,
          "functions",
          "Grant them with these `gcloud` commands:",
        );
      });

      it("should not print or warn for declarative security managed accounts", async () => {
        setIamStub.resolves({});
        const managedFn: backend.Endpoint = {
          id: "managedFn",
          entryPoint: "managedFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: `firebase-fn-1234567890@${projectId}.iam.gserviceaccount.com`,
          ...SPEC,
        };
        const printStub = sinon.stub(iam, "printManualIamConfig");

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(managedFn),
          backend.empty(),
        );

        expect(setIamStub).to.have.been.calledOnceWithExactly(
          projectNumber,
          { etag: "etag", version: 3, bindings: [BINDING, PUBSUB_TOKEN_CREATOR] },
          "bindings",
        );
        expect(printStub).to.not.have.been.called;
        expect(warnStub).to.not.have.been.called;
      });

      it("should print only the custom accounts when managed accounts are also present", async () => {
        setIamStub.resolves({});
        const managedFn: backend.Endpoint = {
          id: "managedFn",
          entryPoint: "managedFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: `firebase-fn-1234567890@${projectId}.iam.gserviceaccount.com`,
          ...SPEC,
        };
        const customFn: backend.Endpoint = {
          id: "customFn",
          entryPoint: "customFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };
        const printStub = sinon.stub(iam, "printManualIamConfig");

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(managedFn, customFn),
          backend.empty(),
        );

        expect(printStub).to.have.been.calledOnceWithExactly(
          [
            { role: checkIam.RUN_INVOKER_ROLE, members: [`serviceAccount:${CUSTOM_SA}`] },
            {
              role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
              members: [`serviceAccount:${CUSTOM_SA}`],
            },
          ],
          projectId,
          "functions",
          "Grant them with these `gcloud` commands:",
        );
      });

      it("should ignore v1 functions without a service account", async () => {
        setIamStub.resolves({});
        const v1Fn: backend.Endpoint = {
          id: "v1Fn",
          entryPoint: "v1Fn",
          platform: "gcfv1",
          eventTrigger: {
            eventType: "providers/cloud.pubsub/eventTypes/topic.publish",
            eventFilters: { resource: "projects/my-project/topics/my-topic" },
            retry: false,
          },
          ...SPEC,
        };
        const v2Fn: backend.Endpoint = {
          id: "v2Fn",
          entryPoint: "v2Fn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(v1Fn, v2Fn),
          backend.empty(),
        );

        expect(setIamStub).to.have.been.calledOnceWithExactly(
          projectNumber,
          { etag: "etag", version: 3, bindings: [BINDING, PUBSUB_TOKEN_CREATOR] },
          "bindings",
        );
      });

      it("should error when a v2 event function would run as the default account", async () => {
        const customFn: backend.Endpoint = {
          id: "customFn",
          entryPoint: "customFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };
        const defaultFn: backend.Endpoint = {
          id: "defaultFn",
          entryPoint: "defaultFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          ...SPEC,
        };

        await expect(
          checkIam.ensureServiceAgentRoles(
            projectId,
            projectNumber,
            backend.of(customFn, defaultFn),
            backend.empty(),
          ),
        ).to.be.rejectedWith(FirebaseError, /does not exist.*defaultFn/);
        expect(setIamStub).to.not.have.been.called;
      });

      it("should error when a v2 event function explicitly sets the default account", async () => {
        const printStub = sinon.stub(iam, "printManualIamConfig");
        const explicitDefaultFn: backend.Endpoint = {
          id: "explicitDefaultFn",
          entryPoint: "explicitDefaultFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: DEFAULT_SA,
          ...SPEC,
        };

        await expect(
          checkIam.ensureServiceAgentRoles(
            projectId,
            projectNumber,
            backend.of(explicitDefaultFn),
            backend.empty(),
          ),
        ).to.be.rejectedWith(FirebaseError, /does not exist.*explicitDefaultFn/);
        expect(printStub).to.not.have.been.called;
        expect(setIamStub).to.not.have.been.called;
      });

      it("should skip the default account's bindings in a dry run", async () => {
        const wantFn: backend.Endpoint = {
          id: "wantFn",
          entryPoint: "wantFn",
          platform: "gcfv2",
          eventTrigger: ALERTS_TRIGGER,
          serviceAccount: CUSTOM_SA,
          ...SPEC,
        };

        await checkIam.ensureServiceAgentRoles(
          projectId,
          projectNumber,
          backend.of(wantFn),
          backend.empty(),
          true,
        );

        expect(getServiceAccountStub).to.have.been.calledOnce;
        expect(setIamStub).to.not.have.been.called;
        expect(warnStub).to.have.been.calledWithMatch("functions", DEFAULT_SA);
      });
    });

    it("should still add the default account's bindings when its lookup fails with another error", async () => {
      getServiceAccountStub.rejects(new FirebaseError("forbidden", { status: 403 }));
      getIamStub.resolves({ etag: "etag", version: 3, bindings: [BINDING] });
      setIamStub.resolves({});
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.firebase.firebasealerts.alerts.v1.published",
          eventFilters: { alertype: "crashlytics.newFatalIssue" },
          retry: false,
        },
        serviceAccount: CUSTOM_SA,
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(
        projectId,
        projectNumber,
        backend.of(wantFn),
        backend.empty(),
      );

      const policy = setIamStub.firstCall.args[1] as iam.Policy;
      expect(policy.bindings).to.deep.include({
        role: checkIam.RUN_INVOKER_ROLE,
        members: [`serviceAccount:${DEFAULT_SA}`],
      });
      expect(policy.bindings).to.deep.include({
        role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
        members: [`serviceAccount:${DEFAULT_SA}`],
      });
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
