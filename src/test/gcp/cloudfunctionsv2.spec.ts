import { expect } from "chai";
import * as nock from "nock";

import * as cloudfunctionsv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "../../deploy/functions/backend";
import * as events from "../../functions/events";
import * as projectConfig from "../../functions/projectConfig";
import { BLOCKING_LABEL, CODEBASE_LABEL, HASH_LABEL } from "../../functions/constants";
import { functionsV2Origin } from "../../api";
import { FirebaseError } from "../../error";

describe("cloudfunctionsv2", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  const CLOUD_FUNCTION_V2_SOURCE: cloudfunctionsv2.StorageSource = {
    bucket: "sample",
    object: "source.zip",
    generation: 42,
  };

  // Omit a random trigger to get this fragment to compile.
  const ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    ...FUNCTION_NAME,
    entryPoint: "function",
    runtime: "nodejs16",
    codebase: projectConfig.DEFAULT_CODEBASE,
    runServiceId: "service",
    source: { storageSource: CLOUD_FUNCTION_V2_SOURCE },
  };

  const CLOUD_FUNCTION_V2: cloudfunctionsv2.InputCloudFunction = {
    name: "projects/project/locations/region/functions/id",
    buildConfig: {
      entryPoint: "function",
      runtime: "nodejs16",
      source: {
        storageSource: CLOUD_FUNCTION_V2_SOURCE,
      },
      environmentVariables: {},
    },
    serviceConfig: {
      availableMemory: `${backend.DEFAULT_MEMORY}Mi`,
    },
  };

  const RUN_URI = "https://id-nonce-region-project.run.app";
  const HAVE_CLOUD_FUNCTION_V2: cloudfunctionsv2.OutputCloudFunction = {
    ...CLOUD_FUNCTION_V2,
    serviceConfig: {
      service: "service",
      uri: RUN_URI,
    },
    state: "ACTIVE",
    updateTime: new Date(),
  };

  describe("megabytes", () => {
    enum Bytes {
      KB = 1e3,
      MB = 1e6,
      GB = 1e9,
      KiB = 1 << 10,
      MiB = 1 << 20,
      GiB = 1 << 30,
    }
    it("Should handle decimal SI units", () => {
      expect(cloudfunctionsv2.mebibytes("1000k")).to.equal((1000 * Bytes.KB) / Bytes.MiB);
      expect(cloudfunctionsv2.mebibytes("1.5M")).to.equal((1.5 * Bytes.MB) / Bytes.MiB);
      expect(cloudfunctionsv2.mebibytes("1G")).to.equal(Bytes.GB / Bytes.MiB);
    });
    it("Should handle binary SI units", () => {
      expect(cloudfunctionsv2.mebibytes("1Mi")).to.equal(Bytes.MiB / Bytes.MiB);
      expect(cloudfunctionsv2.mebibytes("1Gi")).to.equal(Bytes.GiB / Bytes.MiB);
    });
    it("Should handle no unit", () => {
      expect(cloudfunctionsv2.mebibytes("100000")).to.equal(100000 / Bytes.MiB);
      expect(cloudfunctionsv2.mebibytes("1e9")).to.equal(1e9 / Bytes.MiB);
      expect(cloudfunctionsv2.mebibytes("1.5E6")).to.equal((1.5 * 1e6) / Bytes.MiB);
    });
  });
  describe("functionFromEndpoint", () => {
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctionsv2.functionFromEndpoint({ ...ENDPOINT, httpsTrigger: {}, platform: "gcfv1" });
      }).to.throw();
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          httpsTrigger: {},
        }),
      ).to.deep.equal(CLOUD_FUNCTION_V2);

      const eventEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {
            resource: "projects/p/regions/r/instances/i",
            serviceName: "compute.googleapis.com",
          },
          retry: true,
          channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
        },
      };
      const eventGcfFunction: cloudfunctionsv2.InputCloudFunction = {
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
          retryPolicy: "RETRY_POLICY_RETRY",
          channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: { FUNCTION_SIGNATURE_TYPE: "cloudevent" },
        },
      };
      expect(cloudfunctionsv2.functionFromEndpoint(eventEndpoint)).to.deep.equal(eventGcfFunction);

      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          eventTrigger: {
            eventType: "google.firebase.database.ref.v1.written",
            eventFilters: {
              instance: "my-db-1",
            },
            eventFilterPathPatterns: {
              path: "foo/{bar}",
            },
            retry: false,
          },
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: "google.firebase.database.ref.v1.written",
          eventFilters: [
            {
              attribute: "instance",
              value: "my-db-1",
            },
            {
              attribute: "path",
              value: "foo/{bar}",
              operator: "match-path-pattern",
            },
          ],
          retryPolicy: "RETRY_POLICY_DO_NOT_RETRY",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: { FUNCTION_SIGNATURE_TYPE: "cloudevent" },
        },
      });

      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          taskQueueTrigger: {},
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          "deployment-taskqueue": "true",
        },
      });

      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          blockingTrigger: {
            eventType: events.v1.BEFORE_CREATE_EVENT,
          },
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          [BLOCKING_LABEL]: "before-create",
        },
      });

      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          blockingTrigger: {
            eventType: events.v1.BEFORE_SIGN_IN_EVENT,
          },
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          [BLOCKING_LABEL]: "before-sign-in",
        },
      });
    });

    it("should copy trival fields", () => {
      const fullEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        vpc: {
          connector: "connector",
          egressSettings: "ALL_TRAFFIC",
        },
        ingressSettings: "ALLOW_ALL",
        serviceAccount: "inlined@google.com",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
        secretEnvironmentVariables: [
          {
            secret: "MY_SECRET",
            key: "MY_SECRET",
            projectId: "project",
          },
        ],
      };

      const fullGcfFunction: cloudfunctionsv2.InputCloudFunction = {
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          foo: "bar",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: {
            FOO: "bar",
          },
          secretEnvironmentVariables: [
            {
              secret: "MY_SECRET",
              key: "MY_SECRET",
              projectId: "project",
            },
          ],
          vpcConnector: "connector",
          vpcConnectorEgressSettings: "ALL_TRAFFIC",
          ingressSettings: "ALLOW_ALL",
          serviceAccountEmail: "inlined@google.com",
        },
      };

      expect(cloudfunctionsv2.functionFromEndpoint(fullEndpoint)).to.deep.equal(fullGcfFunction);
    });

    it("should calculate non-trivial fields", () => {
      const complexEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        eventTrigger: {
          eventType: events.v2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            topic: "projects/p/topics/t",
            serviceName: "pubsub.googleapis.com",
          },
          retry: false,
        },
        maxInstances: 42,
        minInstances: 1,
        timeoutSeconds: 15,
        availableMemoryMb: 128,
      };

      const complexGcfFunction: cloudfunctionsv2.InputCloudFunction = {
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: events.v2.PUBSUB_PUBLISH_EVENT,
          pubsubTopic: "projects/p/topics/t",
          eventFilters: [
            {
              attribute: "serviceName",
              value: "pubsub.googleapis.com",
            },
          ],
          retryPolicy: "RETRY_POLICY_DO_NOT_RETRY",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          maxInstanceCount: 42,
          minInstanceCount: 1,
          timeoutSeconds: 15,
          availableMemory: "128Mi",
          environmentVariables: { FUNCTION_SIGNATURE_TYPE: "cloudevent" },
        },
      };

      expect(cloudfunctionsv2.functionFromEndpoint(complexEndpoint)).to.deep.equal(
        complexGcfFunction,
      );
    });

    it("should correctly convert CPU and concurrency values", () => {
      const endpoint: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        concurrency: 40,
        cpu: 2,
      };
      const gcfFunction: cloudfunctionsv2.InputCloudFunction = {
        ...CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          maxInstanceRequestConcurrency: 40,
          availableCpu: "2",
        },
      };
      expect(cloudfunctionsv2.functionFromEndpoint(endpoint)).to.deep.equal(gcfFunction);
    });

    it("should export codebase as label", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          codebase: "my-codebase",
          httpsTrigger: {},
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: { ...CLOUD_FUNCTION_V2.labels, [CODEBASE_LABEL]: "my-codebase" },
      });
    });

    it("should export hash as label", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint({ ...ENDPOINT, hash: "my-hash", httpsTrigger: {} }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: { ...CLOUD_FUNCTION_V2.labels, [HASH_LABEL]: "my-hash" },
      });
    });
  });

  describe("endpointFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(cloudfunctionsv2.endpointFromFunction(HAVE_CLOUD_FUNCTION_V2)).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        uri: RUN_URI,
      });
    });

    it("should copy run service IDs", () => {
      const fn: cloudfunctionsv2.OutputCloudFunction = {
        ...HAVE_CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
          service: "projects/p/locations/l/services/service-id",
        },
      };
      expect(cloudfunctionsv2.endpointFromFunction(fn)).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        uri: RUN_URI,
        runServiceId: "service-id",
      });
    });

    it("should translate event triggers", () => {
      let want: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        eventTrigger: {
          eventType: events.v2.PUBSUB_PUBLISH_EVENT,
          eventFilters: { topic: "projects/p/topics/t" },
          retry: false,
        },
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: events.v2.PUBSUB_PUBLISH_EVENT,
            pubsubTopic: "projects/p/topics/t",
          },
        }),
      ).to.deep.equal(want);

      // And again w/ a normal event trigger
      want = {
        ...want,
        eventTrigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {
            resource: "projects/p/regions/r/instances/i",
            serviceName: "compute.googleapis.com",
          },
          retry: false,
        },
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
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
        }),
      ).to.deep.equal(want);

      // And again with a pattern match event trigger
      want = {
        ...want,
        eventTrigger: {
          eventType: "google.firebase.database.ref.v1.written",
          eventFilters: {
            instance: "my-db-1",
          },
          eventFilterPathPatterns: {
            path: "foo/{bar}",
          },
          retry: false,
        },
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: "google.firebase.database.ref.v1.written",
            eventFilters: [
              {
                attribute: "instance",
                value: "my-db-1",
              },
              {
                attribute: "path",
                value: "foo/{bar}",
                operator: "match-path-pattern",
              },
            ],
          },
        }),
      ).to.deep.equal(want);

      // And again with a pattern match event trigger
      want = {
        ...want,
        eventTrigger: {
          eventType: "google.cloud.firestore.document.v1.written",
          eventFilters: {
            database: "(default)",
            namespace: "(default)",
          },
          eventFilterPathPatterns: {
            document: "users/{userId}",
          },
          retry: false,
        },
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: "google.cloud.firestore.document.v1.written",
            eventFilters: [
              {
                attribute: "database",
                value: "(default)",
              },
              {
                attribute: "namespace",
                value: "(default)",
              },
              {
                attribute: "document",
                value: "users/{userId}",
                operator: "match-path-pattern",
              },
            ],
            pubsubTopic: "eventarc-us-central1-abc", // firestore triggers use pubsub as transport
          },
        }),
      ).to.deep.equal(want);
    });

    it("should translate custom event triggers", () => {
      const want: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        eventTrigger: {
          eventType: "com.custom.event",
          eventFilters: { customattr: "customvalue" },
          channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
          retry: false,
        },
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: "com.custom.event",
            eventFilters: [
              {
                attribute: "customattr",
                value: "customvalue",
              },
            ],
            channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
          },
        }),
      ).to.deep.equal(want);
    });

    it("should translate task queue functions", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: { "deployment-taskqueue": "true" },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        taskQueueTrigger: {},
        platform: "gcfv2",
        uri: RUN_URI,
        labels: { "deployment-taskqueue": "true" },
      });
    });

    it("should translate beforeCreate blocking functions", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: { "deployment-blocking": "before-create" },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        blockingTrigger: {
          eventType: events.v1.BEFORE_CREATE_EVENT,
        },
        platform: "gcfv2",
        uri: RUN_URI,
        labels: { "deployment-blocking": "before-create" },
      });
    });

    it("should translate beforeSignIn blocking functions", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: { "deployment-blocking": "before-sign-in" },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        blockingTrigger: {
          eventType: events.v1.BEFORE_SIGN_IN_EVENT,
        },
        platform: "gcfv2",
        uri: RUN_URI,
        labels: { "deployment-blocking": "before-sign-in" },
      });
    });

    it("should copy optional fields", () => {
      const extraFields: backend.ServiceConfiguration = {
        ingressSettings: "ALLOW_ALL",
        timeoutSeconds: 15,
        environmentVariables: {
          FOO: "bar",
        },
      };
      const vpc = {
        connector: "connector",
        egressSettings: "ALL_TRAFFIC" as const,
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraFields,
            serviceAccountEmail: "inlined@google.com",
            vpcConnector: vpc.connector,
            vpcConnectorEgressSettings: vpc.egressSettings,
            availableMemory: "128Mi",
          },
          labels: {
            foo: "bar",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        uri: RUN_URI,
        ...extraFields,
        serviceAccount: "inlined@google.com",
        vpc,
        availableMemoryMb: 128,
        labels: {
          foo: "bar",
        },
      });
    });

    it("should transform fields", () => {
      const extraFields: backend.ServiceConfiguration = {
        minInstances: 1,
        maxInstances: 42,
      };

      const extraGcfFields: Partial<cloudfunctionsv2.ServiceConfig> = {
        minInstanceCount: 1,
        maxInstanceCount: 42,
      };

      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraGcfFields,
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        httpsTrigger: {},
        ...extraFields,
      });
    });

    it("should derive codebase from labels", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: {
            ...CLOUD_FUNCTION_V2.labels,
            [CODEBASE_LABEL]: "my-codebase",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        httpsTrigger: {},
        labels: {
          ...ENDPOINT.labels,
          [CODEBASE_LABEL]: "my-codebase",
        },
        codebase: "my-codebase",
      });
    });

    it("should derive hash from labels", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: {
            ...CLOUD_FUNCTION_V2.labels,
            [CODEBASE_LABEL]: "my-codebase",
            [HASH_LABEL]: "my-hash",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        httpsTrigger: {},
        labels: {
          ...ENDPOINT.labels,
          [CODEBASE_LABEL]: "my-codebase",
          [HASH_LABEL]: "my-hash",
        },
        codebase: "my-codebase",
        hash: "my-hash",
      });
    });

    it("should convert function without serviceConfig", () => {
      const expectedEndpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
      };
      delete expectedEndpoint.runServiceId;
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: undefined,
        }),
      ).to.deep.equal(expectedEndpoint);
    });
  });

  describe("listFunctions", () => {
    it("should pass back an error with the correct status", async () => {
      nock(functionsV2Origin)
        .get("/v2/projects/foo/locations/-/functions")
        .query({ filter: `environment="GEN_2"` })
        .reply(403, { error: "You don't have permissions." });

      let errCaught = false;
      try {
        await cloudfunctionsv2.listFunctions("foo", "-");
      } catch (err: unknown) {
        errCaught = true;
        expect(err).instanceOf(FirebaseError);
        expect(err).has.property("status", 403);
      }

      expect(errCaught, "should have caught an error").to.be.true;
      expect(nock.isDone()).to.be.true;
    });
  });
});
