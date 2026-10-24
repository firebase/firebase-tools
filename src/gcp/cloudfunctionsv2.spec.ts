import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import * as cloudfunctionsv2 from "./cloudfunctionsv2";
import * as backend from "../deploy/functions/backend";
import * as events from "../functions/events";
import * as projectConfig from "../functions/projectConfig";
import * as utils from "../utils";
import { logger } from "../logger";
import { BLOCKING_LABEL, CODEBASE_LABEL, HASH_LABEL } from "../functions/constants";
import { functionsV2Origin } from "../api";

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
    region: "region",
    codebase: projectConfig.DEFAULT_CODEBASE,
    runServiceId: "service",
    source: { storageSource: CLOUD_FUNCTION_V2_SOURCE },
    state: "ACTIVE",
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
      environmentVariables: {
        FUNCTION_REGION: ENDPOINT.region,
      },
    },
  };

  const RUN_URI = "https://id-nonce-region-project.run.app";
  const GCF_URL = "https://region-project.cloudfunctions.net/id";
  const HAVE_CLOUD_FUNCTION_V2: cloudfunctionsv2.OutputCloudFunction = {
    ...CLOUD_FUNCTION_V2,
    serviceConfig: {
      service: "service",
      uri: RUN_URI,
    },
    url: GCF_URL,
    state: "ACTIVE",
    updateTime: new Date(),
  };

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
          environmentVariables: {
            FUNCTION_REGION: ENDPOINT.region,
            FUNCTION_SIGNATURE_TYPE: "cloudevent",
          },
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
          environmentVariables: {
            FUNCTION_REGION: ENDPOINT.region,
            FUNCTION_SIGNATURE_TYPE: "cloudevent",
          },
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

      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          platform: "gcfv2",
          callableTrigger: {
            genkitAction: "flows/flow",
          },
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          "deployment-callable": "true",
          "genkit-action": "true",
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
            FUNCTION_REGION: ENDPOINT.region,
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

    it("should translate networkInterfaces", () => {
      const endpointWithNi: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        vpc: {
          networkInterfaces: [{ network: "my-net" }],
          egressSettings: "ALL_TRAFFIC",
        },
      };

      const gcfFunctionWithNi: cloudfunctionsv2.InputCloudFunction = {
        ...CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          directVpcNetworkInterface: [{ network: "my-net" }],
          directVpcEgress: "VPC_EGRESS_ALL_TRAFFIC",
        },
      };

      expect(cloudfunctionsv2.functionFromEndpoint(endpointWithNi)).to.deep.equal(
        gcfFunctionWithNi,
      );

      const reverted = cloudfunctionsv2.endpointFromFunction({
        ...HAVE_CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
          directVpcNetworkInterface: [{ network: "my-net" }],
          directVpcEgress: "VPC_EGRESS_ALL_TRAFFIC",
          uri: RUN_URI,
          service: "service",
        },
      });
      expect(reverted.vpc).to.deep.equal(endpointWithNi.vpc);
    });

    it("should throw on unexpected VPC egress setting", () => {
      expect(() => {
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            directVpcNetworkInterface: [{ network: "my-net" }],
            directVpcEgress: "ALL_TRAFFIC" as any,
            uri: RUN_URI,
            service: "service",
          },
        } as cloudfunctionsv2.OutputCloudFunction);
      }).to.throw("Unexpected VPC egress setting: ALL_TRAFFIC");
    });

    it("should ignore VPC_EGRESS_UNSPECIFIED", () => {
      const gcf = {
        ...HAVE_CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
          directVpcNetworkInterface: [{ network: "my-net" }],
          directVpcEgress: "VPC_EGRESS_UNSPECIFIED" as any,
          uri: RUN_URI,
          service: "service",
        },
      } as cloudfunctionsv2.OutputCloudFunction;
      const endpoint = cloudfunctionsv2.endpointFromFunction(gcf);
      expect(endpoint.vpc).to.deep.equal({
        networkInterfaces: [{ network: "my-net" }],
      });
      expect(endpoint.vpc?.egressSettings).to.be.undefined;
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
          environmentVariables: {
            FUNCTION_REGION: ENDPOINT.region,
            FUNCTION_SIGNATURE_TYPE: "cloudevent",
          },
        },
      };

      expect(cloudfunctionsv2.functionFromEndpoint(complexEndpoint)).to.deep.equal(
        complexGcfFunction,
      );
    });

    it("should propagate serviceAccount to eventarc", () => {
      const saEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        eventTrigger: {
          eventType: events.v2.DATABASE_EVENTS[0],
          eventFilters: {
            ref: "ref",
          },
          retry: false,
        },
        serviceAccount: "sa@google.com",
      };

      const saGcfFunction: cloudfunctionsv2.InputCloudFunction = {
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: events.v2.DATABASE_EVENTS[0],
          eventFilters: [
            {
              attribute: "ref",
              value: "ref",
            },
          ],
          retryPolicy: "RETRY_POLICY_DO_NOT_RETRY",
          serviceAccountEmail: "sa@google.com",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: {
            FUNCTION_REGION: ENDPOINT.region,
            FUNCTION_SIGNATURE_TYPE: "cloudevent",
          },
          serviceAccountEmail: "sa@google.com",
        },
      };

      expect(cloudfunctionsv2.functionFromEndpoint(saEndpoint)).to.deep.equal(saGcfFunction);
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

    it("should expand shorthand service account to full email", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          serviceAccount: "sa@",
          httpsTrigger: {},
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          serviceAccountEmail: `sa@${ENDPOINT.project}.iam.gserviceaccount.com`,
        },
      });
    });

    it("should handle null service account", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint({
          ...ENDPOINT,
          serviceAccount: null,
          httpsTrigger: {},
        }),
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          serviceAccountEmail: null,
        },
      });
    });
  });

  describe("endpointFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(cloudfunctionsv2.endpointFromFunction(HAVE_CLOUD_FUNCTION_V2)).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        uri: GCF_URL,
      });
    });

    it("should copy run service IDs", () => {
      const fn: cloudfunctionsv2.OutputCloudFunction = {
        ...HAVE_CLOUD_FUNCTION_V2,
        serviceConfig: {
          ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
          service: "projects/p/locations/l/services/service-id",
          uri: RUN_URI,
        },
      };
      expect(cloudfunctionsv2.endpointFromFunction(fn)).to.deep.equal({
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
        uri: GCF_URL,
        runServiceId: "service-id",
      });
    });

    it("should translate event triggers", () => {
      let want: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        uri: GCF_URL,
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
        uri: GCF_URL,
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
        uri: GCF_URL,
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
        uri: GCF_URL,
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
        uri: GCF_URL,
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
            uri: RUN_URI,
            service: "service",
          },
          labels: {
            foo: "bar",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        uri: GCF_URL,
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
            uri: RUN_URI,
            service: "service",
          },
        }),
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: GCF_URL,
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
        uri: GCF_URL,
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
        uri: GCF_URL,
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
        uri: GCF_URL,
      };
      delete expectedEndpoint.runServiceId;
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: undefined,
        }),
      ).to.deep.equal(expectedEndpoint);
    });

    it("should convert function without buildConfig", () => {
      const expectedEndpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        uri: GCF_URL,
        entryPoint: "",
        runtime: undefined,
        source: undefined,
      };
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          buildConfig: undefined,
        }),
      ).to.deep.equal(expectedEndpoint);
    });
  });

  describe("createFunction", () => {
    afterEach(() => {
      sinon.restore();
      nock.cleanAll();
    });

    it("should set default environment variables", async () => {
      const testFunction = {
        ...CLOUD_FUNCTION_V2,
        name: "projects/project/locations/region/functions/id",
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: {},
        },
        buildConfig: {
          ...CLOUD_FUNCTION_V2.buildConfig,
          environmentVariables: {},
        },
      };

      const scope = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions", (body) => {
          expect(body.serviceConfig.environmentVariables).to.have.property(
            "LOG_EXECUTION_ID",
            "true",
          );
          expect(body.serviceConfig.environmentVariables).to.have.property(
            "FUNCTION_TARGET",
            "function",
          );
          expect(body.buildConfig.environmentVariables).to.have.property(
            "GOOGLE_NODE_RUN_SCRIPTS",
            "",
          );
          return true;
        })
        .query({ functionId: "id" })
        .reply(200, { name: "operations/123", done: true });

      await cloudfunctionsv2.createFunction(testFunction);
      expect(scope.isDone()).to.be.true;
    });

    it("logs service account propagation errors at debug level without warning banners", async () => {
      const warnSpy = sinon.spy(utils, "logLabeledWarning");
      const debugSpy = sinon.spy(logger, "debug");
      const scope = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions")
        .query({ functionId: "id" })
        .reply(404, {
          error: {
            message:
              "Service account projects/-/serviceAccounts/firebase-fn-101@project.iam.gserviceaccount.com was not found.",
          },
        });

      await expect(
        cloudfunctionsv2.createFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith(
        "Service account projects/-/serviceAccounts/firebase-fn-101@project.iam.gserviceaccount.com was not found.",
      );
      expect(warnSpy.called).to.be.false;
      expect(debugSpy.calledWith(sinon.match("Waiting for service account propagation"))).to.be
        .true;
      expect(scope.isDone()).to.be.true;
    });

    it("suppresses warnings for 400 Eventarc and 403 Cloud Run service account propagation errors", async () => {
      const warnSpy = sinon.spy(utils, "logLabeledWarning");
      const debugSpy = sinon.spy(logger, "debug");
      const scope400 = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions")
        .query({ functionId: "id" })
        .reply(400, {
          error: {
            message:
              "The request was invalid: invalid service account firebase-fn-102@project.iam.gserviceaccount.com provided",
          },
        });
      const scope403 = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions")
        .query({ functionId: "id" })
        .reply(403, {
          error: {
            message:
              "Permission 'iam.serviceaccounts.actAs' denied on service account firebase-fn-103@project.iam.gserviceaccount.com (or it may not exist).",
          },
        });

      await expect(
        cloudfunctionsv2.createFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith(
        "invalid service account firebase-fn-102@project.iam.gserviceaccount.com provided",
      );
      await expect(
        cloudfunctionsv2.createFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith(
        "Permission 'iam.serviceaccounts.actAs' denied on service account firebase-fn-103@project.iam.gserviceaccount.com (or it may not exist).",
      );
      expect(warnSpy.called).to.be.false;
      expect(
        debugSpy.calledWith(
          sinon.match(
            "Waiting for service account propagation while trying to create projects/project/locations/region/functions/id",
          ),
        ),
      ).to.be.true;
      expect(scope400.isDone()).to.be.true;
      expect(scope403.isDone()).to.be.true;
    });

    it("logs warning banners when 404 is for a non-managed service account", async () => {
      const warnSpy = sinon.spy(utils, "logLabeledWarning");
      const debugSpy = sinon.spy(logger, "debug");
      const scope = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions")
        .query({ functionId: "id" })
        .reply(404, {
          error: {
            message:
              "Service account projects/-/serviceAccounts/custom-sa@project.iam.gserviceaccount.com was not found.",
          },
        });

      await expect(
        cloudfunctionsv2.createFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith(
        /^Failed to create function projects\/project\/locations\/region\/functions\/id$/,
      );
      expect(warnSpy.callCount).to.equal(2);
      expect(warnSpy.firstCall.args[1]).to.include(
        "Service account projects/-/serviceAccounts/custom-sa@project.iam.gserviceaccount.com was not found.",
      );
      expect(warnSpy.secondCall.args[1]).to.equal(
        "failed to create function projects/project/locations/region/functions/id",
      );
      expect(debugSpy.calledWith(sinon.match("Waiting for service account propagation"))).to.be
        .false;
      expect(scope.isDone()).to.be.true;
    });

    it("logs only Waiting to retry warning on 429 Quota Exceeded", async () => {
      const warnSpy = sinon.spy(utils, "logLabeledWarning");
      const scope = nock(functionsV2Origin())
        .post("/v2/projects/project/locations/region/functions")
        .query({ functionId: "id" })
        .reply(429, { error: { message: "Quota exceeded" } });

      await expect(
        cloudfunctionsv2.createFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith("Quota exceeded");
      expect(warnSpy.callCount).to.equal(1);
      expect(warnSpy.firstCall.args[1]).to.include("Waiting to retry...");
      expect(scope.isDone()).to.be.true;
    });
  });

  describe("updateFunction", () => {
    afterEach(() => {
      sinon.restore();
      nock.cleanAll();
    });

    it("should set default environment variables", async () => {
      const scope = nock(functionsV2Origin())
        .patch("/v2/projects/project/locations/region/functions/id", (body) => {
          expect(body.serviceConfig.environmentVariables).to.have.property(
            "LOG_EXECUTION_ID",
            "true",
          );
          expect(body.serviceConfig.environmentVariables).to.have.property(
            "FUNCTION_TARGET",
            "function",
          );
          expect(body.buildConfig.environmentVariables).to.have.property(
            "GOOGLE_NODE_RUN_SCRIPTS",
            "",
          );
          return true;
        })
        .query(true) // Accept any query parameters
        .reply(200, { name: "operations/123", done: true });

      await cloudfunctionsv2.updateFunction(CLOUD_FUNCTION_V2);
      expect(scope.isDone()).to.be.true;
    });

    it("logs service account propagation errors at debug level without warning banners on update", async () => {
      const warnSpy = sinon.spy(utils, "logLabeledWarning");
      const debugSpy = sinon.spy(logger, "debug");
      const scope = nock(functionsV2Origin())
        .patch("/v2/projects/project/locations/region/functions/id")
        .query(true)
        .reply(403, {
          error: {
            message:
              "Permission 'iam.serviceaccounts.actAs' denied on service account firebase-fn-104@project.iam.gserviceaccount.com (or it may not exist).",
          },
        });

      await expect(
        cloudfunctionsv2.updateFunction({
          ...CLOUD_FUNCTION_V2,
          buildConfig: { ...CLOUD_FUNCTION_V2.buildConfig },
          serviceConfig: { ...CLOUD_FUNCTION_V2.serviceConfig },
        }),
      ).to.eventually.be.rejectedWith(
        "Permission 'iam.serviceaccounts.actAs' denied on service account firebase-fn-104@project.iam.gserviceaccount.com (or it may not exist).",
      );
      expect(warnSpy.called).to.be.false;
      expect(
        debugSpy.calledWith(
          sinon.match(
            "Waiting for service account propagation while trying to update projects/project/locations/region/functions/id",
          ),
        ),
      ).to.be.true;
      expect(scope.isDone()).to.be.true;
    });
  });
});
