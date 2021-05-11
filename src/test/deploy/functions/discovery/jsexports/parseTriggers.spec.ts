import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import * as parseTriggers from "../../../../../deploy/functions/discovery/jsexports/parseTriggers";
import * as api from "../../../../../api";

describe("addResourcesToBackend", () => {
  const oldDefaultRegion = api.functionsDefaultRegion;
  before(() => {
    (api as any).functionsDefaultRegion = "us-central1";
  });

  after(() => {
    (api as any).functionsDefaultRegion = oldDefaultRegion;
  });

  const BASIC_TRIGGER: parseTriggers.TriggerAnnotation = Object.freeze({
    name: "func",
    entryPoint: "func",
  });

  const BASIC_FUNCTION_NAME: backend.TargetIds = Object.freeze({
    id: "func",
    region: api.functionsDefaultRegion,
    project: "project",
  });

  const BASIC_FUNCTION: Omit<backend.FunctionSpec, "trigger"> = Object.freeze({
    apiVersion: 1,
    ...BASIC_FUNCTION_NAME,
    runtime: "nodejs14",
    entryPoint: "func",
  });

  it("should assert against impossible configurations", () => {
    expect(() => {
      parseTriggers.addResourcesToBackend(
        "project",
        "nodejs14",
        {
          ...BASIC_TRIGGER,
          httpsTrigger: {},
          eventTrigger: {
            eventType: "google.pubsub.topic.publish",
            resource: "projects/project/topics/topic",
            service: "pubsub.googleapis.com",
          },
        },
        backend.empty()
      );
    }).to.throw(FirebaseError);
  });

  it("should handle a minimal https trigger", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            allowInsecure: true,
          },
        },
      ],
    };
    expect(result).to.deep.equal(expected);
  });

  describe("should handle a minimal event trigger", () => {
    for (const failurePolicy of [undefined, false, true, { retry: {} }]) {
      const name =
        typeof failurePolicy === "undefined" ? "undefined" : JSON.stringify(failurePolicy);
      it(`should handle failurePolicy=${name}`, () => {
        const trigger: parseTriggers.TriggerAnnotation = {
          ...BASIC_TRIGGER,
          eventTrigger: {
            service: "pubsub.googleapis.com",
            eventType: "google.pubsub.topic.publish",
            resource: "projects/project/topics/topic",
          },
        };
        if (typeof failurePolicy !== "undefined") {
          trigger.failurePolicy = failurePolicy;
        }

        const result = backend.empty();
        parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

        const expected: backend.Backend = {
          ...backend.empty(),
          cloudFunctions: [
            {
              ...BASIC_FUNCTION,
              trigger: {
                eventType: "google.pubsub.topic.publish",
                eventFilters: {
                  resource: "projects/project/topics/topic",
                },
                retry: !!failurePolicy,
              },
            },
          ],
        };
        expect(result).to.deep.equal(expected);
      });
    }
  });

  it("should copy fields", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      maxInstances: 42,
      minInstances: 1,
      serviceAccountEmail: "inlined@google.com",
      vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
      vpcConnector: "projects/project/locations/region/connectors/connector",
      ingressSettings: "ALLOW_ALL",
      timeout: "60s",
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            allowInsecure: true,
          },
          maxInstances: 42,
          minInstances: 1,
          serviceAccountEmail: "inlined@google.com",
          vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
          vpcConnector: "projects/project/locations/region/connectors/connector",
          ingressSettings: "ALLOW_ALL",
          timeout: "60s",
        },
      ],
    };
    expect(result).to.deep.equal(expected);
  });

  it("should rename/transform fields", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      eventTrigger: {
        eventType: "google.pubsub.topic.publish",
        resource: "projects/p/topics/t",
        service: "pubsub.googleapis.com",
      },
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            eventType: "google.pubsub.topic.publish",
            eventFilters: {
              resource: "projects/p/topics/t",
            },
            retry: false,
          },
        },
      ],
    };
    expect(result).to.deep.equal(expected);
  });

  it("should support explicit regions", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      regions: ["europe-west1"],
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            allowInsecure: true,
          },
          region: "europe-west1",
        },
      ],
    };
    expect(result).to.deep.equal(expected);
  });

  it("should support multiple regions", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      regions: ["us-central1", "europe-west1"],
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            allowInsecure: true,
          },
          region: "us-central1",
        },
        {
          ...BASIC_FUNCTION,
          trigger: {
            allowInsecure: true,
          },
          region: "europe-west1",
        },
      ],
    };

    result.cloudFunctions = result.cloudFunctions.sort();
    expected.cloudFunctions = expected.cloudFunctions.sort();
    expect(result).to.deep.equal(expected);
  });

  it("should support schedules", () => {
    const schedule = {
      schedule: "every 10 minutes",
      timeZone: "America/Los_Angeles",
      retryConfig: {
        retryCount: 20,
        maxRetryDuration: "200s",
        minBackoffDuration: "1s",
        maxBackoffDuration: "10s",
        maxDoublings: 10,
      },
    };
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      regions: ["us-central1", "europe-west1"],
      schedule,
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs14", trigger, result);

    const europeFunctionName = {
      ...BASIC_FUNCTION_NAME,
      region: "europe-west1",
    };

    const usFunction = {
      ...BASIC_FUNCTION,
      trigger: {
        allowInsecure: true,
      },
      labels: {
        "deployment-scheduled": "true",
      },
      region: "us-central1",
    };
    const europeFunction = {
      ...BASIC_FUNCTION,
      ...europeFunctionName,
      trigger: {
        allowInsecure: true,
      },
      labels: {
        "deployment-scheduled": "true",
      },
    };
    const expected: backend.Backend = {
      requiredAPIs: {
        pubsub: "pubsub.googleapis.com",
        scheduler: "cloudscheduler.googleapis.com",
      },
      cloudFunctions: [usFunction, europeFunction],
      topics: [
        {
          id: "firebase-schedule-func-us-central1",
          project: "project",
          targetService: BASIC_FUNCTION_NAME,
        },
        {
          id: "firebase-schedule-func-europe-west1",
          project: "project",
          targetService: europeFunctionName,
        },
      ],
      schedules: [
        {
          id: "firebase-schedule-func-us-central1",
          project: "project",
          ...schedule,
          transport: "pubsub",
          targetService: BASIC_FUNCTION_NAME,
        },
        {
          id: "firebase-schedule-func-europe-west1",
          project: "project",
          ...schedule,
          transport: "pubsub",
          targetService: europeFunctionName,
        },
      ],
    };

    result.cloudFunctions = result.cloudFunctions.sort();
    result.schedules = result.schedules.sort();
    result.topics = result.topics.sort();
    expected.cloudFunctions = expected.cloudFunctions.sort();
    expected.schedules = expected.schedules.sort();
    expected.topics = expected.topics.sort();
    expect(result).to.deep.equal(expected);
  });
});
