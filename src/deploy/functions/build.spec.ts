import { expect } from "chai";
import * as build from "./build";
import { ParamValue, Param } from "./params";
import { FirebaseError } from "../../error";

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
          connector: "{{ params.connector }}",
          egressSettings: "{{ params.egressSettings }}",
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
      connector: new ParamValue("connector", false, { string: true }),
      egressSettings: new ParamValue("ALL_TRAFFIC", false, { string: true }),
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
      expect(endpointDef.func.vpc?.connector).to.equal(
        "projects/project/locations/us-central1/connectors/connector",
      );
      expect(endpointDef.func.vpc?.egressSettings).to.equal("ALL_TRAFFIC");
    }
  });

  it("enforces enum correctness for VPC egress settings", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        platform: "gcfv2",
        region: ["us-central1"],
        project: "project",
        runtime: "nodejs16",
        entryPoint: "func",
        vpc: {
          connector: "connector",
          egressSettings: "{{ params.egressSettings }}",
        },
        httpsTrigger: {},
      },
    });
    expect(() => {
      build.toBackend(desiredBuild, {
        egressSettings: new ParamValue("INVALID", false, { string: true }),
      });
    }).to.throw(FirebaseError, /Value "INVALID" is an invalid egress setting./);
  });

  it("can resolve a service account param", () => {
    const desiredBuild: build.Build = build.of({
      func: {
        platform: "gcfv1",
        region: ["us-central1"],
        project: "project",
        runtime: "nodejs16",
        entryPoint: "func",
        maxInstances: 42,
        minInstances: 1,
        serviceAccount: "{{ params.SERVICE_ACCOUNT }}",
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
    const env = {
      SERVICE_ACCOUNT: new ParamValue("service-account-1@", false, {
        string: true,
        number: false,
        boolean: false,
      }),
    };

    const backend = build.toBackend(desiredBuild, env);
    const endpointDef = Object.values(backend.endpoints)[0];
    if (endpointDef) {
      expect(endpointDef.func.serviceAccount).to.equal("service-account-1@");
    }
  });
});

describe("envWithType", () => {
  it("converts raw environment variables to params with correct type", () => {
    const params: Param[] = [
      {
        name: "A_STR",
        type: "string",
      },
      {
        name: "AN_INT",
        type: "int",
      },
      {
        name: "A_BOOL",
        type: "boolean",
      },
    ];
    const rawEnvs: Record<string, string> = {
      A_STR: "foo",
      AN_INT: "1",
      A_BOOL: "true",
      NOT_PARAM: "not-a-param",
    };
    const out = build.envWithTypes(params, rawEnvs);

    expect(out).to.include.keys(["A_STR", "AN_INT", "A_BOOL"]);

    expect(out.A_STR.legalString).to.be.true;
    expect(out.A_STR.legalBoolean).to.be.false;
    expect(out.A_STR.legalNumber).to.be.false;
    expect(out.A_STR.legalList).to.be.false;
    expect(out.A_STR.asString()).to.equal("foo");

    expect(out.AN_INT.legalString).to.be.false;
    expect(out.AN_INT.legalBoolean).to.be.false;
    expect(out.AN_INT.legalNumber).to.be.true;
    expect(out.AN_INT.legalList).to.be.false;
    expect(out.AN_INT.asNumber()).to.equal(1);

    expect(out.A_BOOL.legalString).to.be.false;
    expect(out.A_BOOL.legalBoolean).to.be.true;
    expect(out.A_BOOL.legalNumber).to.be.false;
    expect(out.A_BOOL.legalList).to.be.false;
    expect(out.A_BOOL.asBoolean()).to.be.true;
  });

  it("converts raw environment variable for secret param with correct type", () => {
    const params: Param[] = [
      {
        name: "WHOOPS_SECRET",
        type: "secret",
      },
    ];
    const rawEnvs: Record<string, string> = {
      A_STR: "foo",
      WHOOPS_SECRET: "super-secret",
    };
    const out = build.envWithTypes(params, rawEnvs);

    expect(out).to.include.keys(["WHOOPS_SECRET"]);

    expect(out.WHOOPS_SECRET.legalString).to.be.true;
    expect(out.WHOOPS_SECRET.legalBoolean).to.be.false;
    expect(out.WHOOPS_SECRET.legalNumber).to.be.false;
    expect(out.WHOOPS_SECRET.legalList).to.be.false;
    expect(out.WHOOPS_SECRET.asString()).to.equal("super-secret");
  });
});
