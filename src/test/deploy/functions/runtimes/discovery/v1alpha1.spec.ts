import { expect } from "chai";

import * as backend from "../../../../../deploy/functions/backend";
import * as build from "../../../../../deploy/functions/build";
import { Runtime } from "../../../../../deploy/functions/runtimes";
import * as v1alpha1 from "../../../../../deploy/functions/runtimes/discovery/v1alpha1";
import { BEFORE_CREATE_EVENT } from "../../../../../functions/events/v1";
import { Param } from "../../../../../deploy/functions/params";

const PROJECT = "project";
const REGION = "region";
const RUNTIME: Runtime = "node14";
const MIN_WIRE_ENDPOINT: Omit<v1alpha1.WireEndpoint, "httpsTrigger"> = {
  entryPoint: "entryPoint",
};

describe("buildFromV1Alpha", () => {
  describe("null handling", () => {
    const ENDPOINT_BASE: Omit<build.Endpoint, "httpsTrigger"> = {
      entryPoint: "entryPoint",
      platform: "gcfv2",
      project: PROJECT,
      region: [REGION],
      runtime: RUNTIME,
    };

    it("handles null top-level keys", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            concurrency: null,
            cpu: null,
            availableMemoryMb: null,
            secretEnvironmentVariables: null,
            timeoutSeconds: null,
            minInstances: null,
            maxInstances: null,
            vpc: null,
            ingressSettings: null,
            serviceAccount: null,
          },
        },
      };

      const expected = build.of({
        id: {
          ...ENDPOINT_BASE,
          httpsTrigger: {},
          concurrency: null,
          cpu: null,
          availableMemoryMb: null,
          secretEnvironmentVariables: null,
          timeoutSeconds: null,
          minInstances: null,
          maxInstances: null,
          vpc: null,
          ingressSettings: null,
          serviceAccount: null,
        },
      });

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles nulls in event triggers", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            eventTrigger: {
              eventType: "google.firebase.database.ref.v1.written",
              eventFilters: {
                ref: "abc",
              },
              retry: false,
              serviceAccount: null,
            },
          },
        },
      };

      const expected = build.of({
        id: {
          ...ENDPOINT_BASE,
          eventTrigger: {
            eventType: "google.firebase.database.ref.v1.written",
            eventFilters: {
              ref: "abc",
            },
            retry: false,
            serviceAccount: null,
          },
        },
      });

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles null in https triggers", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {
              invoker: null,
            },
          },
        },
      };

      const expected = build.of({
        id: {
          ...ENDPOINT_BASE,
          httpsTrigger: {
            invoker: null,
          },
        },
      });

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles nulls in task queue triggers2", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            taskQueueTrigger: {
              retryConfig: null,
              rateLimits: null,
              invoker: null,
            },
          },
        },
      };

      const expected: build.Endpoint = {
        ...ENDPOINT_BASE,
        taskQueueTrigger: {
          retryConfig: null,
          rateLimits: null,
          invoker: null,
        },
      };

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        build.of({ id: expected })
      );

      yaml.endpoints.id.taskQueueTrigger = {
        rateLimits: {
          maxConcurrentDispatches: null,
          maxDispatchesPerSecond: null,
        },
        retryConfig: {
          maxAttempts: null,
          maxRetrySeconds: null,
          minBackoffSeconds: null,
          maxBackoffSeconds: null,
          maxDoublings: null,
        },
      };
      expected.taskQueueTrigger = {
        rateLimits: {
          maxConcurrentDispatches: null,
          maxDispatchesPerSecond: null,
        },
        retryConfig: {
          maxAttempts: null,
          maxRetrySeconds: null,
          minBackoffSeconds: null,
          maxBackoffSeconds: null,
          maxDoublings: null,
        },
      };

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        build.of({ id: expected })
      );
    });

    it("handles null in scheduled triggers", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            scheduleTrigger: {
              schedule: "every 1 minutes",
              timeZone: null,
              retryConfig: null,
            },
          },
        },
      };

      const expected: build.Endpoint = {
        ...ENDPOINT_BASE,
        scheduleTrigger: {
          schedule: "every 1 minutes",
          timeZone: null,
          retryConfig: null,
        },
      };

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        build.of({ id: expected })
      );

      yaml.endpoints.id.scheduleTrigger = {
        schedule: "every 1 minutes",
        retryConfig: {
          retryCount: null,
          maxRetrySeconds: null,
          maxBackoffSeconds: null,
          minBackoffSeconds: null,
          maxDoublings: null,
        },
      };
      expected.scheduleTrigger = {
        schedule: "every 1 minutes",
        timeZone: null,
        retryConfig: {
          retryCount: null,
          maxRetrySeconds: null,
          maxBackoffSeconds: null,
          minBackoffSeconds: null,
          maxDoublings: null,
        },
      };

      expect(v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        build.of({ id: expected })
      );
    });
  });

  describe("Params", () => {
    it("copies param fields", () => {
      const testParams: Param[] = [
        { name: "FOO", type: "string" },
        {
          name: "ASDF",
          type: "string",
          default: "{{ params.FOO }}",
          description: "another test param",
        },
        { name: "BAR", type: "int" },
      ];

      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        params: testParams,
        endpoints: {},
      };
      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.empty();
      expected.params = testParams;
      expect(parsed).to.deep.equal(expected);
    });
  });

  describe("Endpoint keys", () => {
    const DEFAULTED_ENDPOINT: Omit<build.Endpoint, "httpsTrigger" | "secretEnvironmentVariables"> =
      {
        ...MIN_WIRE_ENDPOINT,
        platform: "gcfv2",
        project: PROJECT,
        region: [REGION],
        runtime: RUNTIME,
      };

    it("fills default backend and function fields", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
          },
        },
      };
      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, httpsTrigger: {} } });
      expect(parsed).to.deep.equal(expected);
    });

    it("allows some fields of the endpoint to have a Field<> type", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            concurrency: "{{ params.CONCURRENCY }}",
            availableMemoryMb: "{{ params.MEMORY }}",
            timeoutSeconds: "{{ params.TIMEOUT }}",
            maxInstances: "{{ params.MAX_INSTANCES }}",
            minInstances: "{{ params.MIN_INSTANCES }}",
          },
        },
      };
      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: {
          ...DEFAULTED_ENDPOINT,
          concurrency: "{{ params.CONCURRENCY }}",
          availableMemoryMb: "{{ params.MEMORY }}",
          timeoutSeconds: "{{ params.TIMEOUT }}",
          maxInstances: "{{ params.MAX_INSTANCES }}",
          minInstances: "{{ params.MIN_INSTANCES }}",
          httpsTrigger: {},
        },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies schedules", () => {
      const scheduleTrigger: build.ScheduleTrigger = {
        schedule: "every 5 minutes",
        timeZone: "America/Los_Angeles",
        retryConfig: {
          retryCount: 20,
          minBackoffSeconds: 1,
          maxBackoffSeconds: 20,
          maxRetrySeconds: 120,
          maxDoublings: 10,
        },
      };

      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            scheduleTrigger: scheduleTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, scheduleTrigger } });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies schedules including Field types", () => {
      const scheduleTrigger: build.ScheduleTrigger = {
        schedule: "{{ params.SCHEDULE }}",
        timeZone: "{{ params.TZ }}",
        retryConfig: {
          retryCount: "{{ params.RETRY }}",
          minBackoffSeconds: "{{ params.MIN_BACKOFF }}",
          maxBackoffSeconds: "{{ params.MAX_BACKOFF }}",
          maxRetrySeconds: "{{ params.RETRY_DURATION }}",
          maxDoublings: "{{ params.DOUBLINGS }}",
        },
      };

      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            scheduleTrigger: scheduleTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, scheduleTrigger } });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers", () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.v1.publish",
        eventFilters: { resource: "projects/project/topics/t" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
      };
      const newFormatTrigger: build.EventTrigger = {
        eventType: "google.pubsub.topic.v1.publish",
        eventFilters: { resource: "projects/project/topics/t" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            eventTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: newFormatTrigger },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers with optional values", () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "some.event.type",
        eventFilters: { resource: "my-resource" },
        eventFilterPathPatterns: { instance: "my-instance" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
        channel: "projects/project/locations/region/channels/my-channel",
      };
      const newFormatTrigger: build.EventTrigger = {
        eventType: "some.event.type",
        eventFilters: { resource: "my-resource" },
        eventFilterPathPatterns: { instance: "my-instance" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
        channel: "projects/project/locations/region/channels/my-channel",
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            eventTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: newFormatTrigger },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers with optional values of Field<> types", () => {
      const wireTrigger = {
        eventType: "some.event.type",
        eventFilters: { resource: "my-resource" },
        eventFilterPathPatterns: { instance: "my-instance" },
        region: "{{ params.REGION }}",
        serviceAccountEmail: "sa@",
        retry: "{{ params.RETRY }}",
        channel: "projects/project/locations/region/channels/my-channel",
      };
      const newFormatTrigger: build.EventTrigger = {
        eventType: "some.event.type",
        eventFilters: { resource: "my-resource" },
        eventFilterPathPatterns: { instance: "my-instance" },
        region: "{{ params.REGION }}",
        serviceAccount: "sa@",
        retry: "{{ params.RETRY }}",
        channel: "projects/project/locations/region/channels/my-channel",
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            eventTrigger: wireTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: newFormatTrigger },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers with full resource path", () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.v1.publish",
        eventFilters: { topic: "my-topic" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            eventTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected = build.of({
        id: {
          ...DEFAULTED_ENDPOINT,
          eventTrigger: {
            ...eventTrigger,
            eventFilters: { topic: `projects/${PROJECT}/topics/my-topic` },
          },
        },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies blocking triggers", () => {
      const blockingTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
        options: {
          accessToken: true,
          idToken: false,
          refreshToken: true,
        },
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            blockingTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, blockingTrigger } });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies blocking triggers without options", () => {
      const blockingTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
      };
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            blockingTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, blockingTrigger } });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies optional fields", () => {
      const fields: backend.ServiceConfiguration = {
        concurrency: 42,
        labels: { hello: "world" },
        environmentVariables: { foo: "bar" },
        availableMemoryMb: 256,
        cpu: 2,
        timeoutSeconds: 60,
        maxInstances: 20,
        minInstances: 1,
        vpc: {
          connector: "hello",
          egressSettings: "ALL_TRAFFIC",
        },
        ingressSettings: "ALLOW_INTERNAL_ONLY",
        serviceAccount: "sa@",
        secretEnvironmentVariables: [
          {
            key: "SECRET",
            secret: "SECRET",
            projectId: "project",
          },
        ],
      };

      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            ...fields,
            secretEnvironmentVariables: [
              {
                key: "SECRET",
                // Missing "secret"
                projectId: "project",
              },
            ],
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expectedBuild: build.Endpoint = {
        ...DEFAULTED_ENDPOINT,
        httpsTrigger: {},
        concurrency: 42,
        labels: { hello: "world" },
        environmentVariables: { foo: "bar" },
        availableMemoryMb: 256,
        cpu: 2,
        timeoutSeconds: 60,
        maxInstances: 20,
        minInstances: 1,
        vpc: {
          connector: "hello",
          egressSettings: "ALL_TRAFFIC",
        },
        ingressSettings: "ALLOW_INTERNAL_ONLY",
        serviceAccount: "sa@",
        secretEnvironmentVariables: [
          {
            key: "SECRET",
            secret: "SECRET",
            projectId: "project",
          },
        ],
      };
      expect(parsed).to.deep.equal(build.of({ id: expectedBuild }));
    });

    it("handles multiple regions", () => {
      const yaml: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            region: ["region1", "region2"],
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected = build.of({
        id: {
          ...DEFAULTED_ENDPOINT,
          httpsTrigger: {},
          region: ["region1", "region2"],
        },
      });
      expect(parsed).to.deep.equal(expected);
    });
  });
});
