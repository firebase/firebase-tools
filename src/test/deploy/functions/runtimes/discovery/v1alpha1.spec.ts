import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import * as build from "../../../../../deploy/functions/build";
import { Runtime } from "../../../../../deploy/functions/runtimes";
import * as v1alpha1 from "../../../../../deploy/functions/runtimes/discovery/v1alpha1";
import { BEFORE_CREATE_EVENT } from "../../../../../functions/events/v1";
import { Param } from "../../../../../deploy/functions/params";

const PROJECT = "project";
const REGION = "region";
const RUNTIME: Runtime = "node14";
const MIN_ENDPOINT: Omit<v1alpha1.ManifestEndpoint, "httpsTrigger"> = {
  entryPoint: "entryPoint",
};

async function resolveBackend(bd: build.Build): Promise<backend.Backend> {
  return build.resolveBackend(bd, { functionsSource: "", projectId: PROJECT }, {});
}

describe("buildFromV1Alpha", () => {
  describe("null handling", () => {
    const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
      entryPoint: "entryPoint",
      id: "id",
      platform: "gcfv2",
      project: PROJECT,
      region: REGION,
      runtime: RUNTIME,
    };

    it("handles null top-level keys", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expected = backend.of({
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
      } as backend.Endpoint);

      const build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(expected);
    });

    it("handles nulls in event triggers", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expected = backend.of({
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.firebase.database.ref.v1.written",
          eventFilters: {
            ref: "abc",
          },
          retry: false,
          serviceAccount: null,
        },
      } as backend.Endpoint);

      const build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(expected);
    });

    it("handles null in https triggers", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {
              invoker: null,
            },
          },
        },
      };

      const expected = backend.of({
        ...ENDPOINT_BASE,
        httpsTrigger: {
          invoker: null,
        },
      } as backend.Endpoint);

      const build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(expected);
    });

    it("handles nulls in task queue triggers2", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            taskQueueTrigger: {
              retryConfig: null,
              rateLimits: null,
              invoker: null,
            },
          },
        },
      };

      const expected: backend.Endpoint = {
        ...ENDPOINT_BASE,
        taskQueueTrigger: {
          retryConfig: null,
          rateLimits: null,
          invoker: null,
        },
      };

      let build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(backend.of(expected));

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

      build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(backend.of(expected));
    });

    it("handles null in scheduled triggers", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            scheduleTrigger: {
              schedule: "every 1 minutes",
              timeZone: null,
              retryConfig: null,
            },
          },
        },
      };

      const expected: backend.Endpoint = {
        ...ENDPOINT_BASE,
        scheduleTrigger: {
          schedule: "every 1 minutes",
          timeZone: null,
          retryConfig: null,
        },
      };

      let build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(backend.of(expected));

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

      build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      await expect(resolveBackend(build)).to.eventually.deep.equal(backend.of(expected));
    });
  });

  describe("Params", () => {
    it("copies param fields", () => {
      const testParams: Param[] = [
        { param: "FOO", type: "string" },
        {
          param: "ASDF",
          type: "string",
          default: "{{ params.FOO }}",
          description: "another test param",
        },
        { param: "BAR", type: "int" },
      ];

      const yaml: v1alpha1.Manifest = {
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
    const DEFAULTED_BACKEND_ENDPOINT: Omit<
      backend.Endpoint,
      "httpsTrigger" | "secretEnvironmentVariables"
    > = {
      ...MIN_ENDPOINT,
      platform: "gcfv2",
      id: "id",
      project: PROJECT,
      region: REGION,
      runtime: RUNTIME,
    };
    const DEFAULTED_ENDPOINT: Omit<build.Endpoint, "httpsTrigger" | "secretEnvironmentVariables"> =
      {
        ...MIN_ENDPOINT,
        platform: "gcfv2",
        project: PROJECT,
        region: [REGION],
        runtime: RUNTIME,
      };

    it("fills default backend and function fields", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {},
          },
        },
      };
      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, httpsTrigger: {} } });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend: backend.Backend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        httpsTrigger: {},
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies schedules", async () => {
      const scheduleBackendTrigger: backend.ScheduleTrigger = {
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

      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            scheduleTrigger: scheduleBackendTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, scheduleTrigger } });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        scheduleTrigger: scheduleBackendTrigger,
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies event triggers", async () => {
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
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            eventTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: newFormatTrigger },
      });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        eventTrigger,
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies event triggers with optional values", async () => {
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
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            eventTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: newFormatTrigger },
      });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        eventTrigger,
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies event triggers with full resource path", async () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.v1.publish",
        eventFilters: { topic: "my-topic" },
        region: "us-central1",
        serviceAccount: "sa@",
        retry: true,
      };
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        eventTrigger: {
          ...eventTrigger,
          eventFilters: { topic: `projects/${PROJECT}/topics/my-topic` },
        },
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies blocking triggers", async () => {
      const blockingTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
        options: {
          accessToken: true,
          idToken: false,
          refreshToken: true,
        },
      };
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            blockingTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, blockingTrigger } });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        blockingTrigger: {
          ...blockingTrigger,
        },
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies blocking triggers without options", async () => {
      const blockingTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
      };
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            blockingTrigger,
          },
        },
      };

      const parsed = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: build.Build = build.of({ id: { ...DEFAULTED_ENDPOINT, blockingTrigger } });
      expect(parsed).to.deep.equal(expected);

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        blockingTrigger: {
          ...blockingTrigger,
        },
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("copies optional fields", async () => {
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

      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expectedBackend = backend.of({
        ...DEFAULTED_BACKEND_ENDPOINT,
        httpsTrigger: {},
        ...fields,
      });
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });

    it("handles multiple regions", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expectedBackend = backend.of(
        {
          ...DEFAULTED_BACKEND_ENDPOINT,
          httpsTrigger: {},
          region: "region1",
        },
        {
          ...DEFAULTED_BACKEND_ENDPOINT,
          httpsTrigger: {},
          region: "region2",
        }
      );
      await expect(resolveBackend(parsed)).to.eventually.deep.equal(expectedBackend);
    });
  });
});

describe("backendFromV1Alpha1", () => {
  describe("null handling", () => {
    const ENDPOINT_BASE: Omit<backend.Endpoint, "httpsTrigger"> = {
      entryPoint: "entryPoint",
      id: "id",
      platform: "gcfv2",
      project: PROJECT,
      region: REGION,
      runtime: RUNTIME,
    };
    it("handles null top-level keys", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expected = backend.of({
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
      } as backend.Endpoint);
      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles nulls in event triggers", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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

      const expected = backend.of({
        ...ENDPOINT_BASE,
        eventTrigger: {
          eventType: "google.firebase.database.ref.v1.written",
          eventFilters: {
            ref: "abc",
          },
          retry: false,
          serviceAccount: null,
        },
      } as backend.Endpoint);
      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles null in https triggers", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {
              invoker: null,
            },
          },
        },
      };

      const expected = backend.of({
        ...ENDPOINT_BASE,
        httpsTrigger: {
          invoker: null,
        },
      } as backend.Endpoint);
      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(expected);
    });

    it("handles nulls in task queue triggers", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            taskQueueTrigger: {
              retryConfig: null,
              rateLimits: null,
              invoker: null,
            },
          },
        },
      };

      const expected: backend.Endpoint = {
        ...ENDPOINT_BASE,
        taskQueueTrigger: {
          retryConfig: null,
          rateLimits: null,
          invoker: null,
        },
      };
      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        backend.of(expected)
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

      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        backend.of(expected)
      );
    });

    it("handles null in scheduled triggers", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            scheduleTrigger: {
              schedule: "every 1 minutes",
              timeZone: null,
              retryConfig: null,
            },
          },
        },
      };

      const expected: backend.Endpoint = {
        ...ENDPOINT_BASE,
        scheduleTrigger: {
          schedule: "every 1 minutes",
          timeZone: null,
          retryConfig: null,
        },
      };
      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        backend.of(expected)
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
        retryConfig: {
          retryCount: null,
          maxRetrySeconds: null,
          maxBackoffSeconds: null,
          minBackoffSeconds: null,
          maxDoublings: null,
        },
      };

      expect(v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME)).to.deep.equal(
        backend.of(expected)
      );
    });
  });

  describe("parser errors", () => {
    function assertParserError(obj: unknown): void {
      expect(() => v1alpha1.backendFromV1Alpha1(obj, PROJECT, REGION, RUNTIME)).to.throw(
        FirebaseError
      );
    }

    describe("backend keys", () => {
      it("throws on the empty object", () => {
        assertParserError({});
      });

      const invalidBackendTypes = {
        requiredAPIS: ["cloudscheduler.googleapis.com"],
        endpoints: [],
      };
      for (const [key, value] of Object.entries(invalidBackendTypes)) {
        it(`throws on invalid value for top-level key ${key}`, () => {
          const obj = {
            requiredAPIs: [],
            endpoints: {},
            [key]: value,
          };
          assertParserError(obj);
        });
      }

      it("throws on unknown keys", () => {
        assertParserError({ eventArcTriggers: [] });
      });
    }); // top level keys

    describe("Endpoint keys", () => {
      it("invalid keys", () => {
        assertParserError({
          endpoints: {
            id: {
              ...MIN_ENDPOINT,
              httpsTrigger: {},
              invalid: "key",
            },
          },
        });
      });

      for (const key of Object.keys(MIN_ENDPOINT)) {
        it(`missing Endpoint key ${key}`, () => {
          const func = { ...MIN_ENDPOINT, httpsTrigger: {} } as Record<string, unknown>;
          delete func[key];
          assertParserError({ cloudFunctions: [func] });
        });
      }

      const invalidFunctionEntries = {
        platform: 2,
        id: 1,
        region: "us-central1",
        project: 42,
        runtime: null,
        entryPoint: 5,
        availableMemoryMb: "2GB",
        maxInstances: "2",
        minInstances: "1",
        serviceAccount: { ldap: "inlined" },
        timeoutSeconds: "60s",
        trigger: [],
        vpcConnector: 2,
        vpcConnectorEgressSettings: {},
        labels: "yes",
        ingressSettings: true,
        cpu: "gcf_gen6",
      };
      for (const [key, value] of Object.entries(invalidFunctionEntries)) {
        it(`invalid value for CloudFunction key ${key}`, () => {
          const endpoint = {
            ...MIN_ENDPOINT,
            httpsTrigger: {},
            [key]: value,
          };
          assertParserError({ endpoints: { endpoint } });
        });
      }
    }); // Top level function keys

    describe("Event triggers", () => {
      const validTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.v1.topic.publish",
        eventFilters: { resource: "projects/p/topics/t" },
        retry: true,
        region: "global",
        serviceAccount: "root@",
      };
      it(`missing event trigger key eventType`, () => {
        const eventTrigger = { ...validTrigger } as Record<string, unknown>;
        delete eventTrigger["eventType"];
        assertParserError({
          endpoints: {
            func: { ...MIN_ENDPOINT, eventTrigger },
          },
        });
      });

      const invalidEntries = {
        eventType: { foo: "bar" },
        eventFilters: 42,
        retry: {},
        region: ["us-central1"],
        serviceAccount: ["ldap"],
        channel: "foo/bar/channel-id",
      };
      for (const [key, value] of Object.entries(invalidEntries)) {
        it(`invalid value for event trigger key ${key}`, () => {
          const eventTrigger = {
            ...validTrigger,
            [key]: value,
          };
          assertParserError({
            endpoints: {
              func: { ...MIN_ENDPOINT, eventTrigger },
            },
          });
        });
      }
    }); // Event triggers

    describe("httpsTriggers", () => {
      it("invalid value for https trigger key invoker", () => {
        assertParserError({
          endpoints: {
            func: {
              ...MIN_ENDPOINT,
              httpsTrigger: { invoker: 42 },
            },
          },
        });
      });
    });

    describe("scheduleTriggers", () => {
      const validTrigger: backend.ScheduleTrigger = {
        schedule: "every 5 minutes",
        timeZone: "America/Los_Angeles",
        retryConfig: {
          retryCount: 42,
          minBackoffSeconds: 1,
          maxBackoffSeconds: 20,
          maxDoublings: 20,
          maxRetrySeconds: 120,
        },
      };

      const invalidEntries = {
        schedule: 46,
        timeZone: {},
      };
      for (const [key, value] of Object.entries(invalidEntries)) {
        it(`invalid value for schedule trigger key ${key}`, () => {
          const scheduleTrigger = {
            ...validTrigger,
            [key]: value,
          };
          assertParserError({
            endpoints: {
              func: { ...MIN_ENDPOINT, scheduleTrigger },
            },
          });
        });
      }

      const invalidRetryEntries = {
        retryCount: "42",
        minBackoffSeconds: "1s",
        maxBackoffSeconds: "20s",
        maxDoublings: "20",
        maxRetrySeconds: "120s",
      };
      for (const [key, value] of Object.entries(invalidRetryEntries)) {
        const retryConfig = {
          ...validTrigger.retryConfig,
          [key]: value,
        };
        const scheduleTrigger = { ...validTrigger, retryConfig };
        assertParserError({
          endpoints: {
            func: { ...MIN_ENDPOINT, scheduleTrigger },
          },
        });
      }
    });

    describe("taskQueueTriggers", () => {
      const validTrigger: backend.TaskQueueTrigger = {
        rateLimits: {
          maxConcurrentDispatches: 10,
          maxDispatchesPerSecond: 20,
        },
        retryConfig: {
          maxAttempts: 3,
          maxRetrySeconds: 120,
          minBackoffSeconds: 1,
          maxBackoffSeconds: 30,
          maxDoublings: 5,
        },
        invoker: ["custom@"],
      };

      const invalidRateLimits = {
        maxConcurrentDispatches: "10",
        maxDispatchesPerSecond: "20",
      };
      for (const [key, value] of Object.entries(invalidRateLimits)) {
        const rateLimits = {
          ...validTrigger.rateLimits,
          [key]: value,
        };
        const taskQueueTrigger = { ...validTrigger, rateLimits };
        assertParserError({
          endpoints: {
            func: { ...MIN_ENDPOINT, taskQueueTrigger },
          },
        });
      }

      const invalidRetryConfigs = {
        maxAttempts: "3",
        maxRetrySeconds: "120s",
        minBackoffSeconds: "1s",
        maxBackoffSeconds: "30s",
        maxDoublings: "5",
      };
      for (const [key, value] of Object.entries(invalidRetryConfigs)) {
        const retryConfig = {
          ...validTrigger.retryConfig,
          [key]: value,
        };
        const taskQueueTrigger = { ...validTrigger, retryConfig };
        assertParserError({
          endpoints: {
            func: { ...MIN_ENDPOINT, taskQueueTrigger },
          },
        });
      }
    });

    describe("blockingTriggers", () => {
      const validTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
        options: {
          accessToken: true,
          idToken: false,
          refreshToken: true,
        },
      };

      const invalidOptions = {
        eventType: true,
        options: 11,
      };

      for (const [key, value] of Object.entries(invalidOptions)) {
        it(`invalid value for blocking trigger key ${key}`, () => {
          const blockingTrigger = {
            ...validTrigger,
            [key]: value,
          };
          assertParserError({
            endpoints: {
              func: { ...MIN_ENDPOINT, blockingTrigger },
            },
          });
        });
      }
    });

    it("detects missing triggers", () => {
      assertParserError({ endpoints: MIN_ENDPOINT });
    });
  }); // Parser errors;

  describe("allows valid backends", () => {
    const DEFAULTED_ENDPOINT: Omit<
      backend.Endpoint,
      "httpsTrigger" | "secretEnvironmentVariables"
    > = {
      ...MIN_ENDPOINT,
      platform: "gcfv2",
      id: "id",
      project: PROJECT,
      region: REGION,
      runtime: RUNTIME,
    };

    it("fills default backend and function fields", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {},
          },
        },
      };
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: backend.Backend = backend.of({ ...DEFAULTED_ENDPOINT, httpsTrigger: {} });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies schedules", () => {
      const scheduleTrigger: backend.ScheduleTrigger = {
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

      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            scheduleTrigger,
          },
        },
      };
      const expected = backend.of({
        ...DEFAULTED_ENDPOINT,
        scheduleTrigger,
      });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
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
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            eventTrigger,
          },
        },
      };
      const expected = backend.of({ ...DEFAULTED_ENDPOINT, eventTrigger });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
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
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            eventTrigger,
          },
        },
      };
      const expected = backend.of({
        ...DEFAULTED_ENDPOINT,
        eventTrigger: {
          ...eventTrigger,
          eventFilters: { topic: `projects/${PROJECT}/topics/my-topic` },
        },
      });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
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
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            blockingTrigger,
          },
        },
      };
      const expected = backend.of({ ...DEFAULTED_ENDPOINT, blockingTrigger });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });

    it("copies blocking triggers without options", () => {
      const blockingTrigger: backend.BlockingTrigger = {
        eventType: BEFORE_CREATE_EVENT,
      };
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            blockingTrigger,
          },
        },
      };
      const expected = backend.of({
        ...DEFAULTED_ENDPOINT,
        blockingTrigger: {
          ...blockingTrigger,
        },
      });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });

    describe("channel name", () => {
      it("resolves partial (channel ID only) channel resource name", () => {
        const eventTrigger: backend.EventTrigger = {
          eventType: "com.custom.event.type",
          eventFilters: {},
          eventFilterPathPatterns: {},
          channel: "my-channel",
          region: "us-central1",
          serviceAccount: "sa@",
          retry: true,
        };
        const yaml: v1alpha1.Manifest = {
          specVersion: "v1alpha1",
          endpoints: {
            id: {
              ...MIN_ENDPOINT,
              eventTrigger,
            },
          },
        };
        const expected = backend.of({
          ...DEFAULTED_ENDPOINT,
          eventTrigger: {
            ...eventTrigger,
            eventFilters: {},
            eventFilterPathPatterns: {},
            channel: "projects/project/locations/region/channels/my-channel",
          },
        });
        const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
        expect(parsed).to.deep.equal(expected);
      });

      it("resolves partial (channel ID and loaction) channel resource name", () => {
        const eventTrigger: backend.EventTrigger = {
          eventType: "com.custom.event.type",
          eventFilters: {},
          channel: "locations/us-wildwest11/channels/my-channel",
          region: "us-central1",
          serviceAccount: "sa@",
          retry: true,
        };
        const yaml: v1alpha1.Manifest = {
          specVersion: "v1alpha1",
          endpoints: {
            id: {
              ...MIN_ENDPOINT,
              eventTrigger,
            },
          },
        };
        const expected = backend.of({
          ...DEFAULTED_ENDPOINT,
          eventTrigger: {
            ...eventTrigger,
            eventFilters: {},
            channel: "projects/project/locations/us-wildwest11/channels/my-channel",
          },
        });
        const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
        expect(parsed).to.deep.equal(expected);
      });

      it("uses full channel resource name as is", () => {
        const eventTrigger: backend.EventTrigger = {
          eventType: "com.custom.event.type",
          eventFilters: {},
          channel: "projects/newyearresolution1/locations/us-wildwest11/channels/my-channel",
          region: "us-central1",
          serviceAccount: "sa@",
          retry: true,
        };
        const yaml: v1alpha1.Manifest = {
          specVersion: "v1alpha1",
          endpoints: {
            id: {
              ...MIN_ENDPOINT,
              eventTrigger,
            },
          },
        };
        const expected = backend.of({
          ...DEFAULTED_ENDPOINT,
          eventTrigger: {
            ...eventTrigger,
            eventFilters: {},
            channel: "projects/newyearresolution1/locations/us-wildwest11/channels/my-channel",
          },
        });
        const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
        expect(parsed).to.deep.equal(expected);
      });
    });

    it("copies optional fields", () => {
      const fields: backend.ServiceConfiguration = {
        concurrency: 42,
        labels: { hello: "world" },
        environmentVariables: { foo: "bar" },
        availableMemoryMb: 256,
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

      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
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
      const expected = backend.of({
        ...DEFAULTED_ENDPOINT,
        httpsTrigger: {},
        ...fields,
      });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });

    it("Accepts serviceAccountEmail as a legacy annotation", async () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            serviceAccountEmail: "sa@",
            eventTrigger: {
              eventType: "google.cloud.pubsub.topic.v1.messagePublished",
              eventFilters: {
                topic: "foo",
              },
              retry: false,
              serviceAccountEmail: "sa2@",
            },
          },
        },
      };

      const expected: backend.Endpoint = {
        ...DEFAULTED_ENDPOINT,
        serviceAccount: "sa@",
        eventTrigger: {
          eventType: "google.cloud.pubsub.topic.v1.messagePublished",
          eventFilters: {
            topic: "projects/project/topics/foo",
          },
          retry: false,
          serviceAccount: "sa2@",
        },
      };

      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(backend.of(expected));

      const build = v1alpha1.buildFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const resolved = await resolveBackend(build);
      expect(resolved).to.deep.equal(backend.of(expected));
    });

    it("handles multiple regions", () => {
      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {},
            region: ["region1", "region2"],
          },
        },
      };
      const expected = backend.of(
        {
          ...DEFAULTED_ENDPOINT,
          httpsTrigger: {},
          region: "region1",
        },
        {
          ...DEFAULTED_ENDPOINT,
          httpsTrigger: {},
          region: "region2",
        }
      );
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });
  });
});
