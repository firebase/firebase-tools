import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import { Runtime } from "../../../../../deploy/functions/runtimes";
import * as v1alpha1 from "../../../../../deploy/functions/runtimes/discovery/v1alpha1";

const PROJECT = "project";
const REGION = "region";
const RUNTIME: Runtime = "node14";
const MIN_FUNC: Partial<backend.FunctionSpec> = {
  platform: "gcfv1",
  id: "id",
  entryPoint: "entryPoint",
  trigger: {},
};

describe("backendFromV1Alpha1", () => {
  describe("parser errors", () => {
    function assertParserError(obj: any) {
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
        cloudFunctions: {},
        topics: {},
        schedules: {},
        environmentVariables: {},
      };
      for (const [key, value] of Object.entries(invalidBackendTypes)) {
        it(`throws on invalid value for top-level key ${key}`, () => {
          const obj = {
            functions: [MIN_FUNC],
            [key]: value,
          };
          assertParserError(obj);
        });
      }

      it("throws on unknown keys", () => {
        assertParserError({ eventArcTriggers: [] });
      });
    }); // top level keys

    describe("CloudFunction keys", () => {
      it("invalid keys", () => {
        assertParserError({
          cloudFunctions: [
            {
              ...MIN_FUNC,
              invalid: "key",
            },
          ],
        });
      });

      for (const key of Object.keys(MIN_FUNC)) {
        it(`missing CloudFunction key ${key}`, () => {
          const func = { ...MIN_FUNC } as Record<string, any>;
          delete func[key];
          assertParserError({ cloudFunctions: [func] });
        });
      }

      const invalidFunctionEntries = {
        apiVersion: "five",
        id: 1,
        region: ["us-central1"],
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
          const func = {
            ...MIN_FUNC,
            [key]: value,
          };
          assertParserError({ cloudFunctions: [func] });
        });
      }
    }); // Top level function keys

    describe("Event triggers", () => {
      const validTrigger: backend.EventTrigger = {
        eventType: "google.pubsub.v1.topic.publish",
        eventFilters: {
          resource: "projects/p/topics/t",
        },
        retry: true,
        region: "global",
        serviceAccountEmail: "root@",
      };
      for (const key of ["eventType", "eventFilters"]) {
        it(`missing event trigger key ${key}`, () => {
          const trigger = { ...validTrigger } as any;
          delete trigger[key];
          assertParserError({
            cloudFunctions: [
              {
                ...MIN_FUNC,
                trigger,
              },
            ],
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
          const trigger = {
            ...validTrigger,
            [key]: value,
          };
          assertParserError({
            cloudFunctions: [
              {
                ...MIN_FUNC,
                trigger,
              },
            ],
          });
        });
      }
    }); // Event triggers
  }); // Parser errors;

  describe("allows valid backends", () => {
    const DEFAULTED_FUNC = {
      ...MIN_FUNC,
      project: PROJECT,
      region: REGION,
      runtime: RUNTIME,
    } as backend.FunctionSpec;

    const TARGET_SERVICE = {
      id: "id",
      project: PROJECT,
      region: REGION,
    };

    it("fills default backend and function fields", () => {
      const yaml = {
        cloudFunctions: [
          {
            ...MIN_FUNC,
            trigger: {},
          },
        ],
      };
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      const expected: backend.Backend = {
        ...backend.empty(),
        cloudFunctions: [
          {
            ...DEFAULTED_FUNC,
            trigger: {},
          },
        ],
      };
      expect(parsed).to.deep.equal(expected);
    });

    it("fills defaults for pub/sub and schedules", () => {
      const yaml = {
        cloudFunctions: [
          {
            ...MIN_FUNC,
            trigger: {},
          },
        ],
        topics: [
          {
            id: "topic",
            targetService: {
              id: "id",
            },
          },
        ],
        schedules: [
          {
            id: "schedule",
            schedule: "every 5 minutes",
            transport: "https",
            targetService: {
              id: "id",
            },
          },
        ],
      };
      const expected: backend.Backend = {
        ...backend.empty(),
        cloudFunctions: [
          {
            ...DEFAULTED_FUNC,
            trigger: {},
          },
        ],
        topics: [
          {
            id: "topic",
            project: PROJECT,
            targetService: TARGET_SERVICE,
          },
        ],
        schedules: [
          {
            id: "schedule",
            project: PROJECT,
            schedule: "every 5 minutes",
            transport: "https",
            targetService: TARGET_SERVICE,
          },
        ],
      };
      const parsed = v1alpha1.backendFromV1Alpha1(yaml, PROJECT, REGION, RUNTIME);
      expect(parsed).to.deep.equal(expected);
    });
  });
});
