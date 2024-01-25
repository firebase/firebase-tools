import { expect } from "chai";
import * as build from "../../../deploy/functions/build";
import { ParamValue } from "../../../deploy/functions/params";

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
          : "",
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
        "httpsTrigger" in endpointDef.func ? endpointDef.func.httpsTrigger.invoker : [],
      ).to.have.members(["service-account-1@", "service-account-2@"]);
    }
  });

  it("populates multiple param values", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        platform: "gcfv2",
        region: ["us-central1"],
        project: "project",
        runtime: "nodejs16",
        entryPoint: "func",
        maxInstances: "{{ params.maxinstances }}",
        minInstances: "{{ params.mininstances }}",
        serviceAccount: "{{ params.serviceaccount }}",
        vpc: {
          connector: "projects/project/locations/region/connectors/connector",
          egressSettings: "PRIVATE_RANGES_ONLY",
        },
        ingressSettings: "ALLOW_ALL",
        labels: {
          test: "testing",
        },
        httpsTrigger: {
          invoker: ["service-account-2@", "service-account-3@"],
        },
      },
    });
    const backend = build.toBackend(desiredBuild, {
      maxinstances: new ParamValue("42", false, { number: true }),
      mininstances: new ParamValue("1", false, { number: true }),
      serviceaccount: new ParamValue("service-account-1@", false, { string: true }),
    });
    expect(Object.keys(backend.endpoints).length).to.equal(1);
    const endpointDef = Object.values(backend.endpoints)[0];
    expect(endpointDef).to.not.equal(undefined);
    if (endpointDef) {
      expect(endpointDef.func.id).to.equal("func");
      expect(endpointDef.func.project).to.equal("project");
      expect(endpointDef.func.region).to.equal("us-central1");
      expect(endpointDef.func.maxInstances).to.equal(42);
      expect(endpointDef.func.minInstances).to.equal(1);
      expect(endpointDef.func.serviceAccount).to.equal("service-account-1@");
      expect(
        "httpsTrigger" in endpointDef.func ? endpointDef.func.httpsTrigger.invoker : [],
      ).to.have.members(["service-account-2@", "service-account-3@"]);
    }
  });
});
