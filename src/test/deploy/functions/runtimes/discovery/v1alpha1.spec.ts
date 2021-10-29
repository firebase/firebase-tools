import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import { Runtime } from "../../../../../deploy/functions/runtimes";
import * as v1alpha1 from "../../../../../deploy/functions/runtimes/discovery/v1alpha1";

const PROJECT = "project";
const REGION = "region";
const RUNTIME: Runtime = "node14";
const MIN_ENDPOINT: Omit<v1alpha1.ManifestEndpoint, "httpsTrigger"> = {
  entryPoint: "entryPoint",
};

describe("backendFromV1Alpha1", () => {
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
            requiredAPIs: {},
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
        serviceAccountEmail: { ldap: "inlined" },
        timeout: 60,
        trigger: [],
        vpcConnector: 2,
        vpcConnectorEgressSettings: {},
        labels: "yes",
        ingressSettings: true,
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
        serviceAccountEmail: "root@",
      };
      for (const key of ["eventType", "eventFilters"]) {
        it(`missing event trigger key ${key}`, () => {
          const eventTrigger = { ...validTrigger } as Record<string, unknown>;
          delete eventTrigger[key];
          assertParserError({
            endpoints: {
              func: { ...MIN_ENDPOINT, eventTrigger },
            },
          });
        });
      }

      const invalidEntries = {
        eventType: { foo: "bar" },
        eventFilters: 42,
        retry: {},
        region: ["us-central1"],
        serviceAccountEmail: ["ldap"],
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
          minBackoffDuration: "1s",
          maxBackoffDuration: "20s",
          maxDoublings: 20,
          maxRetryDuration: "120s",
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
        minBackoffDuration: 1,
        maxBackoffDuration: 20,
        maxDoublings: "20",
        maxRetryDuration: 120,
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
          maxBurstSize: 5,
          maxConcurrentDispatches: 10,
          maxDispatchesPerSecond: 20,
        },
        retryPolicy: {
          maxAttempts: 3,
          maxRetryDuration: "120s",
          minBackoff: "1s",
          maxBackoff: "30s",
          maxDoublings: 5,
        },
        invoker: ["custom@"],
      };

      const invalidRateLimits = {
        maxBurstSize: "5",
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

      const invalidRetryPolicies = {
        maxAttempts: "3",
        maxRetryDuration: 120,
        minBackoff: 1,
        maxBackoff: 30,
        maxDoublings: "5",
      };
      for (const [key, value] of Object.entries(invalidRetryPolicies)) {
        const retryPolicy = {
          ...validTrigger.retryPolicy,
          [key]: value,
        };
        const taskQueueTrigger = { ...validTrigger, retryPolicy };
        assertParserError({
          endpoints: {
            func: { ...MIN_ENDPOINT, taskQueueTrigger },
          },
        });
      }
    });

    it("detects missing triggers", () => {
      assertParserError({ endpoints: MIN_ENDPOINT });
    });
  }); // Parser errors;

  describe("allows valid backends", () => {
    const DEFAULTED_ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = {
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
          minBackoffDuration: "1s",
          maxBackoffDuration: "20s",
          maxRetryDuration: "120s",
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
      const expected = backend.of({ ...DEFAULTED_ENDPOINT, scheduleTrigger });
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });

    it("copies event triggers", () => {
      const eventTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.topic.v1.publish",
        eventFilters: {
          resource: "projects/project/topics/topic",
        },
        region: "us-central1",
        serviceAccountEmail: "sa@",
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

    it("copies optional fields", () => {
      const fields: backend.ServiceConfiguration = {
        concurrency: 42,
        labels: { hello: "world" },
        environmentVariables: { foo: "bar" },
        availableMemoryMb: 256,
        timeout: "60s",
        maxInstances: 20,
        minInstances: 1,
        vpcConnector: "hello",
        vpcConnectorEgressSettings: "ALL_TRAFFIC",
        ingressSettings: "ALLOW_INTERNAL_ONLY",
        serviceAccountEmail: "sa@",
      };

      const yaml: v1alpha1.Manifest = {
        specVersion: "v1alpha1",
        endpoints: {
          id: {
            ...MIN_ENDPOINT,
            httpsTrigger: {},
            ...fields,
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
