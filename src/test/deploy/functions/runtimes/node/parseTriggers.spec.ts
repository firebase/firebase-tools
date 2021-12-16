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

    const expected: backend.Backend = backend.of({ ...BASIC_ENDPOINT, httpsTrigger: {} });
    expect(result).to.deep.equal(expected);
  });

  it("should handle a minimal task queue trigger", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      taskQueueTrigger: {},
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = {
      ...backend.of({ ...BASIC_ENDPOINT, taskQueueTrigger: {} }),
      requiredAPIs: {
        cloudtasks: "cloudtasks.googleapis.com",
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
        const expected: backend.Backend = backend.of({ ...BASIC_ENDPOINT, eventTrigger });
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
    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      httpsTrigger: {
        invoker: ["public"],
      },
      ...config,
    });
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

    const expected: backend.Backend = backend.of({ ...BASIC_ENDPOINT, eventTrigger });
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

    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      region: "europe-west1",
      httpsTrigger: {},
    });
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

    const expected: backend.Backend = backend.of(
      {
        ...BASIC_ENDPOINT,
        httpsTrigger: {},
        region: "us-central1",
      },
      {
        ...BASIC_ENDPOINT,
        httpsTrigger: {},
        region: "europe-west1",
      }
    );

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

    const expected: backend.Backend = {
      ...backend.of(
        {
          ...BASIC_ENDPOINT,
          region: "us-central1",
          labels: {
            test: "testing",
          },
          scheduleTrigger: schedule,
        },
        {
          ...BASIC_ENDPOINT,
          region: "europe-west1",
          labels: {
            test: "testing",
          },
          scheduleTrigger: schedule,
        }
      ),
      requiredAPIs: {
        pubsub: "pubsub.googleapis.com",
        scheduler: "cloudscheduler.googleapis.com",
      },
    };

    expect(result).to.deep.equal(expected);
  });
});
