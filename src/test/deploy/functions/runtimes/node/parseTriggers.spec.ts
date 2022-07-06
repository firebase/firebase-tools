import { expect } from "chai";

import { FirebaseError } from "../../../../../error";
import * as backend from "../../../../../deploy/functions/backend";
import * as build from "../../../../../deploy/functions/build";
import * as parseTriggers from "../../../../../deploy/functions/runtimes/node/parseTriggers";
import * as api from "../../../../../api";
import { BEFORE_CREATE_EVENT } from "../../../../../functions/events/v1";

function applyBuildDefaults(
  endpoint: Omit<backend.Endpoint, "httpsTrigger">
): Omit<backend.Endpoint, "httpsTrigger"> {
  if (!endpoint.timeoutSeconds) {
    endpoint.timeoutSeconds = 60;
  }
  return endpoint;
}

describe("addResourcesToBuild", () => {
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

  const BASIC_ENDPOINT: Omit<build.Endpoint, "httpsTrigger"> = Object.freeze({
    platform: "gcfv1",
    region: [api.functionsDefaultRegion],
    project: "project",
    runtime: "nodejs16",
    entryPoint: "func",
    serviceAccount: null,
  });

  const BASIC_FUNCTION_NAME: backend.TargetIds = Object.freeze({
    id: "func",
    region: api.functionsDefaultRegion,
    project: "project",
  });

  const BASIC_BACKEND_ENDPOINT: Omit<backend.Endpoint, "httpsTrigger"> = Object.freeze(
    applyBuildDefaults({
      platform: "gcfv1",
      ...BASIC_FUNCTION_NAME,
      runtime: "nodejs16",
      entryPoint: "func",
    })
  );

  it("should handle a minimal https trigger, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const expected: build.Build = build.of({ func: { ...BASIC_ENDPOINT, httpsTrigger: {} } });
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = backend.of({
      ...BASIC_BACKEND_ENDPOINT,
      httpsTrigger: {},
    });
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should handle a callable trigger, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      labels: {
        "deployment-callable": "true",
      },
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        callableTrigger: {},
        labels: {},
      },
    });
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = backend.of({
      ...BASIC_BACKEND_ENDPOINT,
      callableTrigger: {},
      labels: {},
    });
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should handle a minimal task queue trigger, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      taskQueueTrigger: {},
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        taskQueueTrigger: {},
      },
    });
    expected.requiredAPIs = [
      {
        api: "cloudtasks.googleapis.com",
        reason: "Needed for task queue functions.",
      },
    ];
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = {
      ...backend.of({ ...BASIC_BACKEND_ENDPOINT, taskQueueTrigger: {} }),
      requiredAPIs: [
        {
          api: "cloudtasks.googleapis.com",
          reason: "Needed for task queue functions.",
        },
      ],
    };
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should copy fields, yielding a build reversibly equivalent to the corresponding backend", () => {
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
      labels: {
        test: "testing",
      },
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const config: Partial<build.Endpoint> = {
      maxInstances: 42,
      minInstances: 1,
      serviceAccount: "inlined@google.com",
      vpc: {
        connector: "projects/project/locations/region/connectors/connector",
        egressSettings: "PRIVATE_RANGES_ONLY",
      },
      ingressSettings: "ALLOW_ALL",
      labels: {
        test: "testing",
      },
    };
    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        ...config,
        httpsTrigger: {
          invoker: "public",
        },
      },
    });
    expect(result).to.deep.equal(expected);

    const backendConfig: backend.ServiceConfiguration = {
      maxInstances: 42,
      minInstances: 1,
      serviceAccountEmail: "inlined@google.com",
      vpc: {
        connector: "projects/project/locations/region/connectors/connector",
        egressSettings: "PRIVATE_RANGES_ONLY",
      },
      ingressSettings: "ALLOW_ALL",
      labels: {
        test: "testing",
      },
    };
    const expectedBackend: backend.Backend = backend.of({
      ...BASIC_BACKEND_ENDPOINT,
      httpsTrigger: {
        invoker: ["public"],
      },
      ...backendConfig,
    });
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should rename/transform fields, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      eventTrigger: {
        eventType: "google.pubsub.topic.publish",
        resource: "projects/p/topics/t",
        service: "pubsub.googleapis.com",
      },
      timeout: "60s",
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const eventTrigger: backend.EventTrigger = {
      eventType: "google.pubsub.topic.publish",
      eventFilters: { resource: "projects/p/topics/t" },
      retry: false,
    };
    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        eventTrigger,
        timeoutSeconds: 60,
      },
    });
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = backend.of({
      ...BASIC_BACKEND_ENDPOINT,
      eventTrigger,
    });
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should support multiple regions, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      regions: ["us-central1", "europe-west1"],
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);
    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        httpsTrigger: {},
        region: ["us-central1", "europe-west1"],
      },
    });
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = backend.of(
      {
        ...BASIC_BACKEND_ENDPOINT,
        httpsTrigger: {},
        region: "us-central1",
      },
      {
        ...BASIC_BACKEND_ENDPOINT,
        httpsTrigger: {},
        region: "europe-west1",
      }
    );
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should support schedules, yielding a build reversibly equivalent to the corresponding backend", () => {
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
    const buildSschedule: build.ScheduleTrigger = {
      schedule: "every 10 minutes",
      timeZone: "America/Los_Angeles",
      retryConfig: {
        retryCount: 20,
        maxRetrySeconds: 200,
        minBackoffSeconds: 1,
        maxBackoffSeconds: 10,
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

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        scheduleTrigger: buildSschedule,
        labels: {
          test: "testing",
        },
        region: ["us-central1", "europe-west1"],
      },
    });
    expected.requiredAPIs = [
      {
        api: "cloudscheduler.googleapis.com",
        reason: "Needed for scheduled functions.",
      },
    ];
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = {
      ...backend.of(
        {
          ...BASIC_BACKEND_ENDPOINT,
          region: "us-central1",
          labels: {
            test: "testing",
          },
          scheduleTrigger: schedule,
        },
        {
          ...BASIC_BACKEND_ENDPOINT,
          region: "europe-west1",
          labels: {
            test: "testing",
          },
          scheduleTrigger: schedule,
        }
      ),
      requiredAPIs: [
        {
          api: "cloudscheduler.googleapis.com",
          reason: "Needed for scheduled functions.",
        },
      ],
    };
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });

  it("should preserve empty vpc connector setting, yielding a build reversibly equivalent to the corresponding backend", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      vpcConnector: "",
    };

    const result = build.empty();
    parseTriggers.addResourcesToBuild("project", "nodejs16", trigger, result);

    const expected: build.Build = build.of({
      func: {
        ...BASIC_ENDPOINT,
        httpsTrigger: {},
        vpc: {
          connector: "",
        },
      },
    });
    expect(result).to.deep.equal(expected);

    const expectedBackend: backend.Backend = backend.of({
      ...BASIC_BACKEND_ENDPOINT,
      httpsTrigger: {},
      vpc: {
        connector: "",
      },
    });
    const convertedBackend: backend.Backend = build.resolveBackend(expected, {});
    expect(convertedBackend).to.deep.equal(expectedBackend);
  });
});

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

  it("should handle a callable trigger", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      labels: {
        "deployment-callable": "true",
      },
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      callableTrigger: {},
      labels: {},
    });
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
      requiredAPIs: [
        {
          api: "cloudtasks.googleapis.com",
          reason: "Needed for task queue functions.",
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
        parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

        const eventTrigger: backend.EventTrigger = {
          eventType: "google.pubsub.topic.publish",
          eventFilters: { resource: "projects/project/topics/topic" },
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
      vpc: {
        connector: "projects/project/locations/region/connectors/connector",
        egressSettings: "PRIVATE_RANGES_ONLY",
      },
      ingressSettings: "ALLOW_ALL",
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
      timeout: "60s",
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const eventTrigger: backend.EventTrigger = {
      eventType: "google.pubsub.topic.publish",
      eventFilters: { resource: "projects/p/topics/t" },
      retry: false,
    };

    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      eventTrigger,
      timeoutSeconds: 60,
    });
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
      requiredAPIs: [
        {
          api: "cloudscheduler.googleapis.com",
          reason: "Needed for scheduled functions.",
        },
      ],
    };

    expect(result).to.deep.equal(expected);
  });

  it("should preserve empty vpc connector setting", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      vpcConnector: "",
    };

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      httpsTrigger: {},
      vpc: {
        connector: "",
      },
    });

    expect(result).to.deep.equal(expected);
  });

  it("should parse secret", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      httpsTrigger: {},
      secrets: ["MY_SECRET"],
    };

    const expected: backend.Backend = backend.of({
      ...BASIC_ENDPOINT,
      httpsTrigger: {},
      secretEnvironmentVariables: [
        {
          projectId: "project",
          secret: "MY_SECRET",
          key: "MY_SECRET",
        },
      ],
    });

    const result = backend.empty();
    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);
    expect(result).to.deep.equal(expected);
  });

  it("should parse a basic blocking trigger", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      blockingTrigger: {
        eventType: BEFORE_CREATE_EVENT,
      },
    };
    const expected: backend.Backend = {
      ...backend.of({
        ...BASIC_ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: undefined,
        },
      }),
      requiredAPIs: [
        {
          api: "identitytoolkit.googleapis.com",
          reason: "Needed for auth blocking functions.",
        },
      ],
    };
    const result = backend.empty();

    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    expect(result).to.deep.equal(expected);
  });

  it("should parse a blocking trigger with options", () => {
    const trigger: parseTriggers.TriggerAnnotation = {
      ...BASIC_TRIGGER,
      blockingTrigger: {
        eventType: BEFORE_CREATE_EVENT,
        options: {
          accessToken: true,
          idToken: false,
          refreshToken: true,
        },
      },
    };
    const expected: backend.Backend = {
      ...backend.of({
        ...BASIC_ENDPOINT,
        blockingTrigger: {
          eventType: BEFORE_CREATE_EVENT,
          options: {
            accessToken: true,
            idToken: false,
            refreshToken: true,
          },
        },
      }),
      requiredAPIs: [
        {
          api: "identitytoolkit.googleapis.com",
          reason: "Needed for auth blocking functions.",
        },
      ],
    };
    const result = backend.empty();

    parseTriggers.addResourcesToBackend("project", "nodejs16", trigger, result);

    expect(result).to.deep.equal(expected);
  });
});
