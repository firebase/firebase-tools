import { expect } from "chai";

import * as cloudfunctionsv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "../../deploy/functions/backend";

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
  };

  const CLOUD_FUNCTION_V2_SOURCE: cloudfunctionsv2.StorageSource = {
    bucket: "sample",
    object: "source.zip",
    generation: 42,
  };

  const CLOUD_FUNCTION_V2: Omit<
    cloudfunctionsv2.CloudFunction,
    cloudfunctionsv2.OutputOnlyFields
  > = {
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

  describe("functionFromEndpoint", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
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
          "deployment-taskqueue": "true",
        },
      });
    });

    it("should copy trival fields", () => {
      const fullEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        httpsTrigger: {},
        platform: "gcfv2",
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

      const fullGcfFunction: Omit<
        cloudfunctionsv2.CloudFunction,
        cloudfunctionsv2.OutputOnlyFields
      > = {
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

      expect(
        cloudfunctionsv2.functionFromEndpoint(fullEndpoint, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(fullGcfFunction);
    });

    it("should calculate non-trivial fields", () => {
      const complexEndpoint: backend.Endpoint = {
        ...ENDPOINT,
        platform: "gcfv2",
        eventTrigger: {
          eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
        maxInstances: 42,
        minInstances: 1,
        timeout: "15s",
      };

      const complexGcfFunction: Omit<
        cloudfunctionsv2.CloudFunction,
        cloudfunctionsv2.OutputOnlyFields
      > = {
        ...CLOUD_FUNCTION_V2,
        eventTrigger: {
          eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
          pubsubTopic: "projects/p/topics/t",
        },
        serviceConfig: {
          ...CLOUD_FUNCTION_V2.serviceConfig,
          maxInstanceCount: 42,
          minInstanceCount: 1,
          timeoutSeconds: 15,
        },
      };

      expect(
        cloudfunctionsv2.functionFromEndpoint(complexEndpoint, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(complexGcfFunction);
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
      expect(
        cloudfunctionsv2.endpointFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
            pubsubTopic: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        eventTrigger: {
          eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });

      // And again w/ a normal event trigger
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
      ).to.deep.equal({
        ...ENDPOINT,
        platform: "gcfv2",
        uri: RUN_URI,
        eventTrigger: {
          eventType: "google.cloud.audit.log.v1.written",
          eventFilters: {
            resource: "projects/p/regions/r/instances/i",
            serviceName: "compute.googleapis.com",
          },
          retry: false,
        },
      });
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

    it("should copy optional fields", () => {
      const extraFields: backend.ServiceConfiguration = {
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
        cloudfunctionsv2.endpointFromFunction({
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
        ...ENDPOINT,
        platform: "gcfv2",
        httpsTrigger: {},
        uri: RUN_URI,
        ...extraFields,
        labels: {
          foo: "bar",
        },
      });
    });

    it("should transform fields", () => {
      const extraFields: backend.ServiceConfiguration = {
        minInstances: 1,
        maxInstances: 42,
        timeout: "15s",
      };

      const extraGcfFields: Partial<cloudfunctionsv2.ServiceConfig> = {
        minInstanceCount: 1,
        maxInstanceCount: 42,
        timeoutSeconds: 15,
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
  });
});
