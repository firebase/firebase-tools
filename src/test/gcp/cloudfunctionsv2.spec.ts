import { expect } from "chai";

import * as cloudfunctionsv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "../../deploy/functions/backend";
import * as events from "../../functions/events";
import * as projectConfig from "../../functions/projectConfig";

describe("cloudfunctionsv2", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  // Omit a random trigger to get this fragment to compile.
  const ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "gcfv2",
    ...FUNCTION_NAME,
    entryPoint: "function",
    runtime: "nodejs16",
    codebase: projectConfig.DEFAULT_CODEBASE,
  };

  const CLOUD_FUNCTION_V2_SOURCE: cloudfunctionsv2.StorageSource = {
    bucket: "sample",
    object: "source.zip",
    generation: 42,
  };

  const CLOUD_FUNCTION_V2: Omit<cloudfunctionsv2.CloudFunction, cloudfunctionsv2.OutputOnlyFields> =
    {
      name: "projects/project/locations/region/functions/id",
      buildConfig: {
        entryPoint: "function",
        runtime: "nodejs16",
        source: {
          storageSource: CLOUD_FUNCTION_V2_SOURCE,
        },
        environmentVariables: {},
      },
      serviceConfig: {},
    };

  const RUN_URI = "https://id-nonce-region-project.run.app";
  const HAVE_CLOUD_FUNCTION_V2: cloudfunctionsv2.CloudFunction = {
    ...CLOUD_FUNCTION_V2,
    serviceConfig: {
      uri: RUN_URI,
    },
    state: "ACTIVE",
    updateTime: new Date(),
  };

  describe("megabytes", () => {
    it("Should handle decimal SI units", () => {
      expect(cloudfunctionsv2.megabytes("1000k")).to.equal(1);
      expect(cloudfunctionsv2.megabytes("1.5M")).to.equal(1.5);
      expect(cloudfunctionsv2.megabytes("1G")).to.equal(1000);
    });
    it("Should handle binary SI units", () => {
      expect(cloudfunctionsv2.megabytes("1Mi")).to.equal((1 << 20) / 1e6);
      expect(cloudfunctionsv2.megabytes("1Gi")).to.equal((1 << 30) / 1e6);
    });
    it("Should handle no unit", () => {
      expect(cloudfunctionsv2.megabytes("100000")).to.equal(0.1);
      expect(cloudfunctionsv2.megabytes("1e9")).to.equal(1000);
      expect(cloudfunctionsv2.megabytes("1.5E6")).to.equal(1.5);
    });
  });
  describe("functionFromEndpoint", () => {
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctionsv2.functionFromEndpoint(
          { ...ENDPOINT, httpsTrigger: {}, platform: "gcfv1" },
          CLOUD_FUNCTION_V2_SOURCE
        );
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint(
          {
            ...ENDPOINT,
            platform: "gcfv2",
            httpsTrigger: {},
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
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
          retry: false,
          channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
        },
      };
      const eventGcfFunction: Omit<
        cloudfunctionsv2.CloudFunction,
        cloudfunctionsv2.OutputOnlyFields
      > = {
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
          channel: "projects/myproject/locations/us-wildwest11/channels/mychannel",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          environmentVariables: { FUNCTION_SIGNATURE_TYPE: "cloudevent" },
        },
      };
      expect(
        cloudfunctionsv2.functionFromEndpoint(eventEndpoint, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(eventGcfFunction);

      expect(
        cloudfunctionsv2.functionFromEndpoint(
          {
            ...ENDPOINT,
            platform: "gcfv2",
            taskQueueTrigger: {},
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          "deployment-taskqueue": "true",
        },
      });

      expect(
        cloudfunctionsv2.functionFromEndpoint(
          {
            ...ENDPOINT,
            platform: "gcfv2",
            blockingTrigger: {
              eventType: events.v1.BEFORE_CREATE_EVENT,
            },
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          [cloudfunctionsv2.BLOCKING_LABEL]: "before-create",
        },
      });

      expect(
        cloudfunctionsv2.functionFromEndpoint(
          {
            ...ENDPOINT,
            platform: "gcfv2",
            blockingTrigger: {
              eventType: events.v1.BEFORE_SIGN_IN_EVENT,
            },
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: {
          ...CLOUD_FUNCTION_V2.labels,
          [cloudfunctionsv2.BLOCKING_LABEL]: "before-sign-in",
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
        serviceAccountEmail: "inlined@google.com",
        labels: {
          foo: "bar",
        },
        environmentVariables: {
          FOO: "bar",
        },
      };

      const fullGcfFunction: Omit<
        cloudfunctionsv2.CloudFunction,
        cloudfunctionsv2.OutputOnlyFields
      > = {
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
          vpcConnector: "connector",
          vpcConnectorEgressSettings: "ALL_TRAFFIC",
          ingressSettings: "ALLOW_ALL",
          serviceAccountEmail: "inlined@google.com",
        },
      };

      expect(
        cloudfunctionsv2.functionFromEndpoint(fullEndpoint, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(fullGcfFunction);
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

      const complexGcfFunction: Omit<
        cloudfunctionsv2.CloudFunction,
        cloudfunctionsv2.OutputOnlyFields
      > = {
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
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          maxInstanceCount: 42,
          minInstanceCount: 1,
          timeoutSeconds: 15,
          availableMemory: "128M",
          environmentVariables: { FUNCTION_SIGNATURE_TYPE: "cloudevent" },
        },
      };

      expect(
        cloudfunctionsv2.functionFromEndpoint(complexEndpoint, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(complexGcfFunction);
    });

    it("should export codebase as label", () => {
      expect(
        cloudfunctionsv2.functionFromEndpoint(
          { ...ENDPOINT, codebase: "my-codebase", httpsTrigger: {} },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal({
        ...CLOUD_FUNCTION_V2,
        labels: { ...CLOUD_FUNCTION_V2.labels, [cloudfunctionsv2.CODEBASE_LABEL]: "my-codebase" },
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
        })
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
        })
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
        })
      ).to.deep.equal(want);
    });

    it("should translate task queue functions", () => {
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          labels: { "deployment-taskqueue": "true" },
        })
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
        })
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
        })
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
        serviceAccountEmail: "inlined@google.com",
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
            vpcConnector: vpc.connector,
            vpcConnectorEgressSettings: vpc.egressSettings,
            availableMemory: "128M",
          },
          labels: {
            foo: "bar",
          },
        })
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        uri: RUN_URI,
        ...extraFields,
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
        })
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
            [cloudfunctionsv2.CODEBASE_LABEL]: "my-codebase",
          },
        })
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        httpsTrigger: {},
        labels: {
          ...ENDPOINT.labels,
          [cloudfunctionsv2.CODEBASE_LABEL]: "my-codebase",
        },
        codebase: "my-codebase",
      });
    });
  });
});
