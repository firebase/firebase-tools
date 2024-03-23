import { expect } from "chai";

import * as backend from "../../../../../deploy/functions/backend";
import * as build from "../../../../../deploy/functions/build";
import { Runtime } from "../../../../../deploy/functions/runtimes";
import * as v1alpha1 from "../../../../../deploy/functions/runtimes/discovery/v1alpha1";
import { BEFORE_CREATE_EVENT } from "../../../../../functions/events/v1";
import { Param } from "../../../../../deploy/functions/params";
import { FirebaseError } from "../../../../../error";

const PROJECT = "project";
const REGION = "region";
const RUNTIME: Runtime = "node14";
const MIN_WIRE_ENDPOINT: Omit<v1alpha1.WireEndpoint, "httpsTrigger"> = {
  entryPoint: "entryPoint",
};

describe("buildFromV1Alpha", () => {
  const MIN_ENDPOINT: Omit<build.Endpoint, "httpsTrigger"> = {
    entryPoint: "entryPoint",
    platform: "gcfv2",
    project: PROJECT,
    region: [REGION],
    runtime: RUNTIME,
  };

  describe("parser errors", () => {
    function assertParserError(obj: unknown): void {
      expect(() => v1alpha1.buildFromV1Alpha1(obj, PROJECT, REGION, RUNTIME)).to.throw(
        FirebaseError,
      );
    }

    describe("build keys", () => {
      it("throws on the empty object", () => {
        assertParserError({});
      });

      const invalidTopLevelKeys = {
        requiredAPIS: ["cloudscheduler.googleapis.com"],
        endpoints: [],
      };
      for (const [key, value] of Object.entries(invalidTopLevelKeys)) {
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
              ...MIN_WIRE_ENDPOINT,
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
      const validTrigger: build.EventTrigger = {
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
      const validTrigger: build.ScheduleTrigger = {
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
      const validTrigger: build.TaskQueueTrigger = {
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
      const validTrigger: build.BlockingTrigger = {
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
        build.of({ id: expected }),
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
        build.of({ id: expected }),
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
        build.of({ id: expected }),
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
        build.of({ id: expected }),
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

    it("allows both CEL and lists containing CEL in FieldList typed keys", () => {
      const yamlCEL: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            region: "{{ params.REGION }}",
          },
        },
      };
      const parsedCEL = v1alpha1.buildFromV1Alpha1(yamlCEL, PROJECT, REGION, RUNTIME);
      const expectedCEL: build.Build = build.of({
        id: {
          ...DEFAULTED_ENDPOINT,
          region: "{{ params.REGION }}",
          httpsTrigger: {},
        },
      });
      expect(parsedCEL).to.deep.equal(expectedCEL);

      const yamlList: v1alpha1.WireManifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_WIRE_ENDPOINT,
            httpsTrigger: {},
            region: ["{{ params.FOO }}", "BAR", "params.BAZ"],
          },
        },
      };
      const parsedList = v1alpha1.buildFromV1Alpha1(yamlList, PROJECT, REGION, RUNTIME);
      const expectedList: build.Build = build.of({
        id: {
          ...DEFAULTED_ENDPOINT,
          region: ["{{ params.FOO }}", "BAR", "params.BAZ"],
          httpsTrigger: {},
        },
      });
      expect(parsedList).to.deep.equal(expectedList);
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
      const eventTrigger: build.EventTrigger = {
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
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: eventTrigger },
      });
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers with optional values", () => {
      const eventTrigger: build.EventTrigger = {
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
        id: { ...DEFAULTED_ENDPOINT, eventTrigger: eventTrigger },
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
      const eventTrigger: build.EventTrigger = {
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
      const blockingTrigger: build.BlockingTrigger = {
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
      const blockingTrigger: build.BlockingTrigger = {
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
