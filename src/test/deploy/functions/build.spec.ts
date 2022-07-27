import { expect } from "chai";
import * as build from "../../../deploy/functions/build";

describe("toBackend", () => {
  it("populates backend info from Build", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        platform: "gcfv1",
        region: ["us-central1"],
        project: "project",
        runtime: "nodejs16",
        entryPoint: "func",
        maxInstances: 42,
        minInstances: 1,
        serviceAccount: "service-account-1@",
        vpc: {
          connector: "projects/project/locations/region/connectors/connector",
          egressSettings: "PRIVATE_RANGES_ONLY",
        },
        ingressSettings: "ALLOW_ALL",
        labels: {
          test: "testing",
        },
        httpsTrigger: {
          invoker: ["public"],
        },
      },
    });
    const backend = build.toBackend(desiredBuild, {});
    expect(Object.keys(backend.endpoints).length).to.equal(1);
    const endpointDef = Object.values(backend.endpoints)[0];
    expect(endpointDef).to.not.equal(undefined);
    if (endpointDef) {
      expect(endpointDef.func.id).to.equal("func");
      expect(endpointDef.func.project).to.equal("project");
      expect(endpointDef.func.region).to.equal("us-central1");
      expect(
        "httpsTrigger" in endpointDef.func
          ? endpointDef.func.httpsTrigger.invoker
            ? endpointDef.func.httpsTrigger.invoker[0]
            : ""
          : ""
      ).to.equal("public");
    }
  });

  it("populates multiple specified invokers correctly", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        platform: "gcfv1",
        region: ["us-central1"],
        project: "project",
        runtime: "nodejs16",
        entryPoint: "func",
        maxInstances: 42,
        minInstances: 1,
        serviceAccount: "service-account-1@",
        vpc: {
          connector: "projects/project/locations/region/connectors/connector",
          egressSettings: "PRIVATE_RANGES_ONLY",
        },
        ingressSettings: "ALLOW_ALL",
        labels: {
          test: "testing",
        },
        httpsTrigger: {
          invoker: ["service-account-1@", "service-account-2@"],
        },
      },
    });
    const backend = build.toBackend(desiredBuild, {});
    expect(Object.keys(backend.endpoints).length).to.equal(1);
    const endpointDef = Object.values(backend.endpoints)[0];
    expect(endpointDef).to.not.equal(undefined);
    if (endpointDef) {
      expect(endpointDef.func.id).to.equal("func");
      expect(endpointDef.func.project).to.equal("project");
      expect(endpointDef.func.region).to.equal("us-central1");
      expect(
        "httpsTrigger" in endpointDef.func ? endpointDef.func.httpsTrigger.invoker : []
      ).to.have.members(["service-account-1@", "service-account-2@"]);
    }
  });

  // Regression test for bug https://github.com/firebase/firebase-tools/issues/4730.
  it("retains correct configuration value for task queue functions", () => {
    const ep: build.Endpoint = {
      platform: "gcfv1",
      region: ["us-central1"],
      project: "project",
      runtime: "nodejs16",
      entryPoint: "func",
      serviceAccount: "service-account-1@",
      timeoutSeconds: 60,
      taskQueueTrigger: {
        retryConfig: {
          maxBackoffSeconds: 42,
          maxAttempts: 42,
          maxDoublings: 42,
          maxRetrySeconds: 42,
          minBackoffSeconds: 42,
        },
        rateLimits: {
          maxConcurrentDispatches: 42,
          maxDispatchesPerSecond: 42,
        },
      },
    };

    const desiredBuild: build.Build = build.of({ func: ep });
    const bk = build.toBackend(desiredBuild, {});
    expect(Object.keys(bk.endpoints).length).to.equal(1);
    const bkendpoint = Object.values(bk.endpoints)[0];

    // TODO: I'm not sure why this fields have different name between build vs backend endpoint definitions.
    delete (ep as any).serviceAccount;

    expect(bkendpoint).to.deep.equal({
      func: {
        ...ep,
        id: "func",
        region: "us-central1",
        serviceAccountEmail: "service-account-1@",
      },
    });
  });
});
