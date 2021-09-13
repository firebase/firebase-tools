import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import * as parseTriggers from "../../../../../deploy/functions/runtimes/node/parseTriggers";
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
    platform: "gcfv1",
    ...BASIC_FUNCTION_NAME,
    runtime: "nodejs16",
    entryPoint: "func",
  });

  const BASIC_ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = Object.freeze({
    platform: "gcfv1",
    ...BASIC_FUNCTION_NAME,
    runtime: "nodejs16",
    entryPoint: "func",
  });

  it("should assert against impossible configurations", () => {
    expect(() => {
      parseTriggers.addResourcesToBackend(
        "project",
        "nodejs16",
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
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {},
        },
      ],
      endpoints: {
        "us-central1": {
          func: {
            ...BASIC_ENDPOINT,
            httpsTrigger: {},
          },
        },
      },
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
        parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

        const eventTrigger: backend.EventTrigger = {
          eventType: "google.pubsub.topic.publish",
          eventFilters: {
            resource: "projects/project/topics/topic",
          },
          retry: !!failurePolicy,
        };
        const expected: backend.Backend = {
          ...backend.empty(),
          cloudFunctions: [
            {
              ...BASIC_FUNCTION,
              trigger: eventTrigger,
            },
          ],
          endpoints: {
            "us-central1": {
              func: {
                ...BASIC_ENDPOINT,
                eventTrigger,
              },
            },
          },
        };
        expect(result).to.deep.equal(expected);
      });
    }
  });

  it("should copy fields", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {
        invoker: ["public"],
      },
      maxInstances: 42,
      minInstances: 1,
      serviceAccountEmail: "inlined@google.com",
      vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
      vpcConnector: "projects/project/locations/region/connectors/connector",
      ingressSettings: "ALLOW_ALL",
      timeout: "60s",
      labels: {
        test: "testing",
      },
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const config: backend.ServiceConfiguration = {
      maxInstances: 42,
      minInstances: 1,
      serviceAccountEmail: "inlined@google.com",
      vpcConnectorEgressSettings: "PRIVATE_RANGES_ONLY",
      vpcConnector: "projects/project/locations/region/connectors/connector",
      ingressSettings: "ALLOW_ALL",
      timeout: "60s",
      labels: {
        test: "testing",
      },
    };
    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {
            invoker: ["public"],
          },
          ...config,
        },
      ],
      endpoints: {
        "us-central1": {
          func: {
            ...BASIC_ENDPOINT,
            httpsTrigger: {
              invoker: ["public"],
            },
            ...config,
          },
        },
      },
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
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const eventTrigger: backend.EventTrigger = {
      eventType: "google.pubsub.topic.publish",
      eventFilters: {
        resource: "projects/p/topics/t",
      },
      retry: false,
    };

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: eventTrigger,
        },
      ],
      endpoints: {
        "us-central1": {
          func: {
            ...BASIC_ENDPOINT,
            eventTrigger,
          },
        },
      },
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
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {},
          region: "europe-west1",
        },
      ],
      endpoints: {
        "europe-west1": {
          func: {
            ...BASIC_ENDPOINT,
            region: "europe-west1",
            httpsTrigger: {},
          },
        },
      },
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
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = {
      ...backend.empty(),
      cloudFunctions: [
        {
          ...BASIC_FUNCTION,
          trigger: {},
          region: "us-central1",
        },
        {
          ...BASIC_FUNCTION,
          trigger: {},
          region: "europe-west1",
        },
      ],
      endpoints: {
        "us-central1": {
          func: {
            ...BASIC_ENDPOINT,
            httpsTrigger: {},
            region: "us-central1",
          },
        },
        "europe-west1": {
          func: {
            ...BASIC_ENDPOINT,
            httpsTrigger: {},
            region: "europe-west1",
          },
        },
      },
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
      eventTrigger: {
        eventType: "google.pubsub.topic.publish",
        resource: "projects/project/topics",
        service: "pubsub.googleapis.com",
      },
      regions: ["us-central1", "europe-west1"],
      schedule,
      labels: {
        test: "testing",
      },
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const europeFunctionName = {
      ...BASIC_FUNCTION_NAME,
      region: "europe-west1",
    };

    const usFunction: backend.FunctionSpec = {
      ...BASIC_FUNCTION,
      trigger: {
        eventType: "google.pubsub.topic.publish",
        eventFilters: {
          resource: `projects/project/topics/${backend.scheduleIdForFunction(BASIC_FUNCTION)}`,
        },
        retry: false,
      },
      labels: {
        "deployment-scheduled": "true",
        test: "testing",
      },
      region: "us-central1",
    };
    const europeFunction: backend.FunctionSpec = {
      ...BASIC_FUNCTION,
      ...europeFunctionName,
      trigger: {
        eventType: "google.pubsub.topic.publish",
        eventFilters: {
          resource: `projects/project/topics/${backend.scheduleIdForFunction(europeFunctionName)}`,
        },
        retry: false,
      },
      labels: {
        "deployment-scheduled": "true",
        test: "testing",
      },
    };
    const expected: backend.Backend = {
      ...backend.empty(),
      requiredAPIs: {
        pubsub: "pubsub.googleapis.com",
        scheduler: "cloudscheduler.googleapis.com",
      },
      cloudFunctions: [usFunction, europeFunction],
      topics: [
        {
          id: "firebase-schedule-func-us-central1",
          project: "project",
          labels: backend.SCHEDULED_FUNCTION_LABEL,
          targetService: BASIC_FUNCTION_NAME,
        },
        {
          id: "firebase-schedule-func-europe-west1",
          project: "project",
          labels: backend.SCHEDULED_FUNCTION_LABEL,
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
      endpoints: {
        "us-central1": {
          func: {
            ...BASIC_ENDPOINT,
            region: "us-central1",
            labels: {
              test: "testing",
            },
            scheduleTrigger: schedule,
          },
        },
        "europe-west1": {
          func: {
            ...BASIC_ENDPOINT,
            region: "europe-west1",
            labels: {
              test: "testing",
            },
            scheduleTrigger: schedule,
          },
        },
      },
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
