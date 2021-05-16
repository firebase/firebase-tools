import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import { previews } from "../../../previews";
import * as args from "../../../deploy/functions/args";
import * as backend from "../../../deploy/functions/backend";
import * as gcf from "../../../gcp/cloudfunctions";
import * as gcfV2 from "../../../gcp/cloudfunctionsv2";
import * as utils from "../../../utils";
import { Context } from "mocha";

describe("Backend", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  const FUNCTION_SPEC: backend.FunctionSpec = {
    apiVersion: 1,
    ...FUNCTION_NAME,
    trigger: {
      allowInsecure: false,
    },
    entryPoint: "function",
    runtime: "nodejs14",
  };

  const CLOUD_FUNCTION: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    entryPoint: "function",
    runtime: "nodejs14",
  };

  const CLOUD_FUNCTION_V2_SOURCE: gcfV2.StorageSource = {
    bucket: "sample",
    object: "source.zip",
    generation: 42,
  };

  const CLOUD_FUNCTION_V2: Omit<gcfV2.CloudFunction, gcfV2.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    buildConfig: {
      entryPoint: "function",
      runtime: "nodejs14",
      source: {
        storageSource: CLOUD_FUNCTION_V2_SOURCE,
      },
      environmentVariables: {},
    },
    serviceConfig: {},
  };

  const RUN_URI = "https://id-nonce-region-project.run.app";
  const HAVE_CLOUD_FUNCTION_V2: gcfV2.CloudFunction = {
    ...CLOUD_FUNCTION_V2,
    serviceConfig: {
      uri: RUN_URI,
    },
    state: "ACTIVE",
    updateTime: new Date(),
  };

  const HAVE_CLOUD_FUNCTION: gcf.CloudFunction = {
    ...CLOUD_FUNCTION,
    buildId: "buildId",
    versionId: 1,
    updateTime: new Date(),
    status: "ACTIVE",
  };

  const SCHEDULE: backend.ScheduleSpec = {
    id: backend.scheduleIdForFunction(FUNCTION_SPEC),
    project: "project",
    schedule: "every 1 minutes",
    transport: "pubsub",
    targetService: FUNCTION_NAME,
  };

  const TOPIC: backend.PubSubSpec = {
    id: backend.scheduleIdForFunction(FUNCTION_SPEC),
    project: "project",
    targetService: FUNCTION_NAME,
  };

  describe("Helper functions", () => {
    it("isEventTrigger", () => {
      const httpsTrigger: backend.HttpsTrigger = {
        allowInsecure: false,
      };
      expect(backend.isEventTrigger(httpsTrigger)).to.be.false;
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.publish",
        eventFilters: {},
        retry: false,
      };
      expect(backend.isEventTrigger(eventTrigger)).to.be.true;
    });

    it("isEmptyBackend", () => {
      expect(backend.isEmptyBackend(backend.empty())).to.be.true;
      expect(
        backend.isEmptyBackend({
          ...backend.empty(),
          requiredAPIs: { foo: "foo.googleapis.com" },
        })
      ).to.be.false;
      expect(
        backend.isEmptyBackend({
          ...backend.empty(),
          cloudFunctions: [FUNCTION_SPEC],
        })
      ).to.be.false;
      expect(
        backend.isEmptyBackend({
          ...backend.empty(),
          schedules: [SCHEDULE],
        })
      ).to.be.false;
      expect(
        backend.isEmptyBackend({
          ...backend.empty(),
          topics: [TOPIC],
        })
      ).to.be.false;
    });

    it("names", () => {
      expect(backend.functionName(FUNCTION_SPEC)).to.equal(
        "projects/project/locations/region/functions/id"
      );
      expect(backend.scheduleName(SCHEDULE, "appEngineRegion")).to.equal(
        "projects/project/locations/appEngineRegion/jobs/firebase-schedule-id-region"
      );
      expect(backend.topicName(TOPIC)).to.equal(
        "projects/project/topics/firebase-schedule-id-region"
      );
    });

    it("sameFunctionName", () => {
      const matcher = backend.sameFunctionName(FUNCTION_SPEC);
      expect(matcher(FUNCTION_SPEC)).to.be.true;
      expect(matcher({ ...FUNCTION_SPEC, id: "other" })).to.be.false;
      expect(matcher({ ...FUNCTION_SPEC, region: "other" })).to.be.false;
      expect(matcher({ ...FUNCTION_SPEC, project: "other" })).to.be.false;
    });
  });

  describe("toGCFv1Function", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        backend.toGCFv1Function({ ...FUNCTION_SPEC, apiVersion: 2 }, UPLOAD_URL);
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(backend.toGCFv1Function(FUNCTION_SPEC, UPLOAD_URL)).to.deep.equal({
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {
          securityLevel: "SECURE_ALWAYS",
        },
      });

      const eventFunction = {
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      };
      const eventGcfFunction = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          resource: "projects/p/topics/t",
          failurePolicy: undefined,
        },
      };
      expect(backend.toGCFv1Function(eventFunction, UPLOAD_URL)).to.deep.equal(eventGcfFunction);
    });

    it("should copy trival fields", () => {
      const fullFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };

      const fullGcfFunction: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        httpsTrigger: {
          securityLevel: "SECURE_ALWAYS",
        },
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
        maxInstances: 42,
        minInstances: 1,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        availableMemoryMb: 128,
        timeout: "15s",
        serviceAccountEmail: "inlined@google.com",
      };

      expect(backend.toGCFv1Function(fullFunction, UPLOAD_URL)).to.deep.equal(fullGcfFunction);
    });

    it("should calculate non-trivial fields", () => {
      const complexFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: true,
        },
      };

      const complexGcfFunction: Omit<gcf.CloudFunction, gcf.OutputOnlyFields> = {
        ...CLOUD_FUNCTION,
        sourceUploadUrl: UPLOAD_URL,
        eventTrigger: {
          eventType: "google.pubsub.topic.publish",
          resource: "projects/p/topics/t",
          failurePolicy: {
            retry: {},
          },
        },
      };

      expect(backend.toGCFv1Function(complexFunction, UPLOAD_URL)).to.deep.equal(
        complexGcfFunction
      );
    });
  });

  describe("fromGCFv1Function", () => {
    it("should copy a minimal version", () => {
      expect(
        backend.fromGCFv1Function({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {
            securityLevel: "SECURE_ALWAYS",
          },
        })
      ).to.deep.equal(FUNCTION_SPEC);
    });

    it("should translate event triggers", () => {
      expect(
        backend.fromGCFv1Function({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
            failurePolicy: {
              retry: {},
            },
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: true,
        },
      });

      // And again w/o the failure policy
      expect(
        backend.fromGCFv1Function({
          ...HAVE_CLOUD_FUNCTION,
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });
    });

    it("should copy optional fields", () => {
      const extraFields: Partial<backend.FunctionSpec> = {
        availableMemoryMb: 128,
        minInstances: 1,
        maxInstances: 42,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        serviceAccountEmail: "inlined@google.com",
        timeout: "15s",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };
      expect(
        backend.fromGCFv1Function({
          ...HAVE_CLOUD_FUNCTION,
          ...extraFields,
          httpsTrigger: {},
        } as gcf.CloudFunction)
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        ...extraFields,
        trigger: {
          allowInsecure: true,
        },
      });
    });

    it("should transform fields", () => {
      expect(
        backend.fromGCFv1Function({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {
            securityLevel: "SECURE_OPTIONAL",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        trigger: {
          allowInsecure: true,
        },
      });
    });
  });

  describe("toGCFv2Function", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        backend.toGCFv2Function({ ...FUNCTION_SPEC, apiVersion: 1 }, CLOUD_FUNCTION_V2_SOURCE);
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(
        backend.toGCFv2Function(
          {
            ...FUNCTION_SPEC,
            apiVersion: 2,
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal(CLOUD_FUNCTION_V2);

      const eventFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        apiVersion: 2,
        trigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {
            resource: "projects/p/regions/r/instances/i",
            serviceName: "compute.googleapis.com",
          },
          retry: false,
        },
      };
      const eventGcfFunction: Omit<gcfV2.CloudFunction, gcfV2.OutputOnlyFields> = {
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: [
            {
              attribute: "resource",
              value: "projects/p/regions/r/instances/i",
            },
            {
              attribute: "serviceName",
              value: "compute.googleapis.com",
            },
          ],
        },
      };
      expect(backend.toGCFv2Function(eventFunction, CLOUD_FUNCTION_V2_SOURCE)).to.deep.equal(
        eventGcfFunction
      );
    });

    it("should copy trival fields", () => {
      const fullFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        apiVersion: 2,
        availableMemoryMb: 128,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        serviceAccountEmail: "inlined@google.com",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };

      const fullGcfFunction: Omit<gcfV2.CloudFunction, gcfV2.OutputOnlyFields> = {
        ...CLOUD_FUNCTION_V2,
        labels: {
          foo: "bar",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: {
            FOO: "bar",
          },
          vpcConnector: "connector",
          vpcConnectorEgressSettings: "ALL_TRAFFIC",
          ingressSettings: "ALLOW_ALL",
          availableMemoryMb: 128,
          serviceAccountEmail: "inlined@google.com",
        },
      };

      expect(backend.toGCFv2Function(fullFunction, CLOUD_FUNCTION_V2_SOURCE)).to.deep.equal(
        fullGcfFunction
      );
    });

    it("should calculate non-trivial fields", () => {
      const complexFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        apiVersion: 2,
        trigger: {
          eventType: gcfV2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
        maxInstances: 42,
        minInstances: 1,
        timeout: "15s",
      };

      const complexGcfFunction: Omit<gcfV2.CloudFunction, gcfV2.OutputOnlyFields> = {
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: gcfV2.PUBSUB_PUBLISH_EVENT,
          pubsubTopic: "projects/p/topics/t",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          maxInstanceCount: 42,
          minInstanceCount: 1,
          timeoutSeconds: 15,
        },
      };

      expect(backend.toGCFv2Function(complexFunction, CLOUD_FUNCTION_V2_SOURCE)).to.deep.equal(
        complexGcfFunction
      );
    });
  });

  describe("fromGCFv2Function", () => {
    it("should copy a minimal version", () => {
      expect(backend.fromGCFv2Function(HAVE_CLOUD_FUNCTION_V2)).to.deep.equal({
        ...FUNCTION_SPEC,
        apiVersion: 2,
        uri: RUN_URI,
      });
    });

    it("should translate event triggers", () => {
      expect(
        backend.fromGCFv2Function({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: gcfV2.PUBSUB_PUBLISH_EVENT,
            pubsubTopic: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        apiVersion: 2,
        uri: RUN_URI,
        trigger: {
          eventType: gcfV2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });

      // And again w/ a normal event trigger
      expect(
        backend.fromGCFv2Function({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: "google.cloud.audit.log.v1.written",
            eventFilters: [
              {
                attribute: "resource",
                value: "projects/p/regions/r/instances/i",
              },
              {
                attribute: "serviceName",
                value: "compute.googleapis.com",
              },
            ],
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        apiVersion: 2,
        uri: RUN_URI,
        trigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {
            resource: "projects/p/regions/r/instances/i",
            serviceName: "compute.googleapis.com",
          },
          retry: false,
        },
      });
    });

    it("should copy optional fields", () => {
      const extraFields: Partial<backend.FunctionSpec> = {
        availableMemoryMb: 128,
        vpcConnector: "connector",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_ALL",
        serviceAccountEmail: "inlined@google.com",
        environmentVariables: {
          FOO: "bar",
        },
      };
      expect(
        backend.fromGCFv2Function({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraFields,
          },
          labels: {
            foo: "bar",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        apiVersion: 2,
        uri: RUN_URI,
        ...extraFields,
        labels: {
          foo: "bar",
        },
      });
    });

    it("should transform fields", () => {
      const extraFields: Partial<backend.FunctionSpec> = {
        minInstances: 1,
        maxInstances: 42,
        timeout: "15s",
      };

      const extraGcfFields: Partial<gcfV2.ServiceConfig> = {
        minInstanceCount: 1,
        maxInstanceCount: 42,
        timeoutSeconds: 15,
      };

      expect(
        backend.fromGCFv2Function({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraGcfFields,
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        apiVersion: 2,
        uri: RUN_URI,
        ...extraFields,
      });
    });
  });

  describe("toJob", () => {
    it("should copy minimal fields", () => {
      expect(backend.toJob(SCHEDULE, "appEngineLocation")).to.deep.equal({
        name: "projects/project/locations/appEngineLocation/jobs/firebase-schedule-id-region",
        schedule: "every 1 minutes",
        pubsubTarget: {
          topicName: "projects/project/topics/firebase-schedule-id-region",
          attributes: {
            scheduled: "true",
          },
        },
      });
    });

    it("should copy optional fields", () => {
      expect(
        backend.toJob(
          {
            ...SCHEDULE,
            retryConfig: {
              maxDoublings: 2,
              maxBackoffDuration: "20s",
              minBackoffDuration: "1s",
              maxRetryDuration: "60s",
            },
          },
          "appEngineLocation"
        )
      ).to.deep.equal({
        name: "projects/project/locations/appEngineLocation/jobs/firebase-schedule-id-region",
        schedule: "every 1 minutes",
        retryConfig: {
          maxDoublings: 2,
          maxBackoffDuration: "20s",
          minBackoffDuration: "1s",
          maxRetryDuration: "60s",
        },
        pubsubTarget: {
          topicName: "projects/project/topics/firebase-schedule-id-region",
          attributes: {
            scheduled: "true",
          },
        },
      });
    });
  });

  describe("existing backend", () => {
    let listAllFunctions: sinon.SinonStub;
    let listAllFunctionsV2: sinon.SinonStub;
    let logLabeledWarning: sinon.SinonSpy;

    beforeEach(() => {
      previews.functionsv2 = false;
      listAllFunctions = sinon.stub(gcf, "listAllFunctions").rejects("Unexpected call");
      listAllFunctionsV2 = sinon.stub(gcfV2, "listAllFunctions").rejects("Unexpected v2 call");
      logLabeledWarning = sinon.spy(utils, "logLabeledWarning");
    });

    afterEach(() => {
      listAllFunctions.restore();
      listAllFunctionsV2.restore();
      logLabeledWarning.restore();
    });

    function newContext(): args.Context {
      return {} as args.Context;
    }

    describe("existingBackend", () => {
      it("should cache", async () => {
        const context = newContext();
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {},
            },
          ],
          unreachable: ["region"],
        });
        const firstBackend = await backend.existingBackend(context);

        const secondBackend = await backend.existingBackend(context);
        await backend.checkAvailability(context, backend.empty());

        expect(firstBackend).to.deep.equal(secondBackend);
        expect(listAllFunctions).to.be.calledOnce;
        expect(listAllFunctionsV2).to.not.be.called;
      });

      it("should translate functions", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              httpsTrigger: {
                securityLevel: "SECURE_ALWAYS",
              },
            },
          ],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal({
          ...backend.empty(),
          cloudFunctions: [FUNCTION_SPEC],
        });
      });

      it("should read v2 functions when enabled", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [HAVE_CLOUD_FUNCTION_V2],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());

        expect(have).to.deep.equal({
          ...backend.empty(),
          cloudFunctions: [
            {
              ...FUNCTION_SPEC,
              apiVersion: 2,
              uri: HAVE_CLOUD_FUNCTION_V2.serviceConfig.uri,
            },
          ],
        });
      });

      it("should deduce features of scheduled functions", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [
            {
              ...HAVE_CLOUD_FUNCTION,
              eventTrigger: {
                eventType: "google.pubsub.topic.publish",
                resource: backend.topicName(TOPIC),
              },
              labels: {
                "deployment-scheduled": "true",
              },
            },
          ],
          unreachable: [],
        });
        const have = await backend.existingBackend(newContext());

        const functionSpec: backend.FunctionSpec = {
          ...FUNCTION_SPEC,
          trigger: {
            eventType: "google.pubsub.topic.publish",
            eventFilters: {
              resource: backend.topicName(TOPIC),
            },
            retry: false,
          },
          labels: {
            "deployment-scheduled": "true",
          },
        };
        const schedule: backend.ScheduleSpec = {
          ...SCHEDULE,
          targetService: FUNCTION_NAME,
        };
        // We don't actually make an API call to cloud scheduler,
        // so we don't have the real schedule.
        delete schedule.schedule;

        expect(have).to.deep.equal({
          requiredAPIs: {},
          cloudFunctions: [functionSpec],
          schedules: [schedule],
          topics: [
            {
              ...TOPIC,
              targetService: FUNCTION_NAME,
            },
          ],
        });
      });
    });

    describe("checkAvailability", () => {
      it("should do nothing when regions are all avalable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.not.have.been.called;
        expect(logLabeledWarning).to.not.have.been.called;
      });

      it("should do nothing when all regions are available and GCFv2 is enabled", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.not.have.been.called;
      });

      it("should warn if an unused backend is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.not.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("should warn if an unused GCFv2 backend is unavailable", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });

        await backend.checkAvailability(newContext(), backend.empty());

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("should throw if a needed region is unavailable", async () => {
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });
        const want = {
          ...backend.empty(),
          cloudFunctions: [FUNCTION_SPEC],
        };
        await expect(backend.checkAvailability(newContext(), want)).to.eventually.be.rejectedWith(
          FirebaseError,
          /The following Cloud Functions regions are currently unreachable:/
        );
      });

      it("should throw if a GCFv2 needed region is unavailable", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["region"],
        });
        const want: backend.Backend = {
          ...backend.empty(),
          cloudFunctions: [
            {
              ...FUNCTION_SPEC,
              apiVersion: 2,
            },
          ],
        };

        await expect(backend.checkAvailability(newContext(), want)).to.eventually.be.rejectedWith(
          FirebaseError,
          /The following Cloud Functions V2 regions are currently unreachable:/
        );
      });

      it("Should only warn when deploying GCFv1 and GCFv2 is unavailable.", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: ["us-central1"],
        });

        const want = {
          ...backend.empty(),
          cloudFunctions: [FUNCTION_SPEC],
        };
        await backend.checkAvailability(newContext(), want);

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });

      it("Should only warn when deploying GCFv2 and GCFv1 is unavailable.", async () => {
        previews.functionsv2 = true;
        listAllFunctions.onFirstCall().resolves({
          functions: [],
          unreachable: ["us-central1"],
        });
        listAllFunctionsV2.onFirstCall().resolves({
          functions: [],
          unreachable: [],
        });

        const want: backend.Backend = {
          ...backend.empty(),
          cloudFunctions: [
            {
              ...FUNCTION_SPEC,
              apiVersion: 2,
            },
          ],
        };
        await backend.checkAvailability(newContext(), want);

        expect(listAllFunctions).to.have.been.called;
        expect(listAllFunctionsV2).to.have.been.called;
        expect(logLabeledWarning).to.have.been.called;
      });
    });
  });
});
