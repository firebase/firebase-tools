import { expect } from "chai";

import * as backend from "../../deploy/functions/backend";
import * as cloudfunctions from "../../gcp/cloudfunctions";

describe("cloudfunctions", () => {
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

  const CLOUD_FUNCTION: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> = {
    name: "projects/project/locations/region/functions/id",
    entryPoint: "function",
    runtime: "nodejs14",
  };

  const HAVE_CLOUD_FUNCTION: cloudfunctions.CloudFunction = {
    ...CLOUD_FUNCTION,
    buildId: "buildId",
    versionId: 1,
    updateTime: new Date(),
    status: "ACTIVE",
  };

  describe("functionFromSpec", () => {
    const UPLOAD_URL = "https://storage.googleapis.com/projects/-/buckets/sample/source.zip";
    it("should guard against version mixing", () => {
      expect(() => {
        cloudfunctions.functionFromSpec({ ...FUNCTION_SPEC, apiVersion: 2 }, UPLOAD_URL);
      }).to.throw;
    });

    it("should copy a minimal function", () => {
      expect(cloudfunctions.functionFromSpec(FUNCTION_SPEC, UPLOAD_URL)).to.deep.equal({
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
      expect(cloudfunctions.functionFromSpec(eventFunction, UPLOAD_URL)).to.deep.equal(
        eventGcfFunction
      );
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

      const fullGcfFunction: Omit<cloudfunctions.CloudFunction, cloudfunctions.OutputOnlyFields> = {
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

      expect(cloudfunctions.functionFromSpec(fullFunction, UPLOAD_URL)).to.deep.equal(
        fullGcfFunction
      );
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

      const complexGcfFunction: Omit<
        cloudfunctions.CloudFunction,
        cloudfunctions.OutputOnlyFields
      > = {
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

      expect(cloudfunctions.functionFromSpec(complexFunction, UPLOAD_URL)).to.deep.equal(
        complexGcfFunction
      );
    });
  });

  describe("specFromFunction", () => {
    it("should copy a minimal version", () => {
      expect(
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          httpsTrigger: {
            securityLevel: "SECURE_ALWAYS",
          },
        })
      ).to.deep.equal(FUNCTION_SPEC);
    });

    it("should translate event triggers", () => {
      expect(
        cloudfunctions.specFromFunction({
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
        cloudfunctions.specFromFunction({
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
        cloudfunctions.specFromFunction({
          ...HAVE_CLOUD_FUNCTION,
          ...extraFields,
          httpsTrigger: {},
        } as cloudfunctions.CloudFunction)
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
        cloudfunctions.specFromFunction({
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
});
