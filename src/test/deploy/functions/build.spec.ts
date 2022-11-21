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

  it("doesn't populate if omit is set on the build", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        omit: true,
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
    expect(Object.keys(backend.endpoints).length).to.equal(0);
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
});
