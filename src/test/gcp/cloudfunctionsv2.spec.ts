import { expect } from "chai";

import * as cloudfunctionsv2 from "../../gcp/cloudfunctionsv2";
import * as backend from "../../deploy/functions/backend";

describe("cloudfunctionsv2", () => {
  const FUNCTION_NAME: backend.TargetIds = {
    id: "id",
    region: "region",
    project: "project",
  };

  const FUNCTION_SPEC: backend.FunctionSpec = {
    platform: "gcfv2",
    ...FUNCTION_NAME,
    trigger: {},
    entryPoint: "function",
    runtime: "nodejs16",
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
        cloudfunctionsv2.functionFromSpec(
          { ...FUNCTION_SPEC, platform: "gcfv1" },
          CLOUD_FUNCTION_V2_SOURCE
        );
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctionsv2.functionFromSpec(
          {
            ...FUNCTION_SPEC,
            platform: "gcfv2",
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal(CLOUD_FUNCTION_V2);

      const eventFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        trigger: {
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
        cloudfunctionsv2.functionFromSpec(eventFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(eventGcfFunction);
    });

    it("should copy trival fields", () => {
      const fullFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
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
        cloudfunctionsv2.functionFromSpec(fullFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(fullGcfFunction);
    });

    it("should calculate non-trivial fields", () => {
      const complexFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        trigger: {
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
        cloudfunctionsv2.functionFromSpec(complexFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(complexGcfFunction);
    });
  });

  describe("endpointFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(cloudfunctionsv2.specFromFunction(HAVE_CLOUD_FUNCTION_V2)).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
      });
    });

    it("should translate event triggers", () => {
      expect(
        cloudfunctionsv2.specFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
            pubsubTopic: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
        trigger: {
          eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });

      // And again w/ a normal event trigger
      expect(
        cloudfunctionsv2.specFromFunction({
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
        platform: "gcfv2",
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
        cloudfunctionsv2.specFromFunction({
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
        platform: "gcfv2",
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

      const extraGcfFields: Partial<cloudfunctionsv2.ServiceConfig> = {
        minInstanceCount: 1,
        maxInstanceCount: 42,
        timeoutSeconds: 15,
      };

      expect(
        cloudfunctionsv2.specFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraGcfFields,
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
        ...extraFields,
      });
    });
  });

  describe("functionFromSpec", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctionsv2.functionFromSpec(
          { ...FUNCTION_SPEC, platform: "gcfv1" },
          CLOUD_FUNCTION_V2_SOURCE
        );
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(
        cloudfunctionsv2.functionFromSpec(
          {
            ...FUNCTION_SPEC,
            platform: "gcfv2",
          },
          CLOUD_FUNCTION_V2_SOURCE
        )
      ).to.deep.equal(CLOUD_FUNCTION_V2);

      const eventFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        trigger: {
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
        cloudfunctionsv2.functionFromSpec(eventFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(eventGcfFunction);
    });

    it("should copy trival fields", () => {
      const fullFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
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
        cloudfunctionsv2.functionFromSpec(fullFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(fullGcfFunction);
    });

    it("should calculate non-trivial fields", () => {
      const complexFunction: backend.FunctionSpec = {
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        trigger: {
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
        cloudfunctionsv2.functionFromSpec(complexFunction, CLOUD_FUNCTION_V2_SOURCE)
      ).to.deep.equal(complexGcfFunction);
    });
  });

  describe("specFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(cloudfunctionsv2.specFromFunction(HAVE_CLOUD_FUNCTION_V2)).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
      });
    });

    it("should translate event triggers", () => {
      expect(
        cloudfunctionsv2.specFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          eventTrigger: {
            eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
            pubsubTopic: "projects/p/topics/t",
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
        trigger: {
          eventType: cloudfunctionsv2.PUBSUB_PUBLISH_EVENT,
          eventFilters: {
            resource: "projects/p/topics/t",
          },
          retry: false,
        },
      });

      // And again w/ a normal event trigger
      expect(
        cloudfunctionsv2.specFromFunction({
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
        platform: "gcfv2",
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
        cloudfunctionsv2.specFromFunction({
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
        platform: "gcfv2",
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

      const extraGcfFields: Partial<cloudfunctionsv2.ServiceConfig> = {
        minInstanceCount: 1,
        maxInstanceCount: 42,
        timeoutSeconds: 15,
      };

      expect(
        cloudfunctionsv2.specFromFunction({
          ...HAVE_CLOUD_FUNCTION_V2,
          serviceConfig: {
            ...HAVE_CLOUD_FUNCTION_V2.serviceConfig,
            ...extraGcfFields,
          },
        })
      ).to.deep.equal({
        ...FUNCTION_SPEC,
        platform: "gcfv2",
        uri: RUN_URI,
        ...extraFields,
      });
    });
  });
});
