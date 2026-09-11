import * as chai from "chai";
import * as sinon from "sinon";

import * as prompt from "../../prompt";
import * as params from "./params";
import * as secretManager from "../../gcp/secretManager";
import { FirebaseError } from "../../error";
import * as utils from "../../utils";
import { logger } from "../../logger";

const expect = chai.expect;
const fakeConfig = {
  locationId: "",
  projectId: "foo",
  storageBucket: "foo.appspot.com",
  databaseURL: "https://foo.firebaseio.com",
};
const expectedInternalParams = {
  DATABASE_URL: new params.ParamValue(fakeConfig.databaseURL, true, {
    string: true,
    boolean: false,
    number: false,
  }),
  GCLOUD_PROJECT: new params.ParamValue(fakeConfig.projectId, true, {
    string: true,
    boolean: false,
    number: false,
  }),
  PROJECT_ID: new params.ParamValue(fakeConfig.projectId, true, {
    string: true,
    boolean: false,
    number: false,
  }),
  STORAGE_BUCKET: new params.ParamValue(fakeConfig.storageBucket, true, {
    string: true,
    boolean: false,
    number: false,
  }),
};

describe("CEL resolution", () => {
  it("can interpolate a provided param into a CEL expression", () => {
    expect(
      params.resolveString("{{ params.foo }} baz", {
        foo: new params.ParamValue("bar", false, { string: true }),
      }),
    ).to.equal("bar baz");
  });

  it("can interpolate multiple params into a CEL expression", () => {
    expect(
      params.resolveString("{{ params.foo }} {{ params.bar }}", {
        foo: new params.ParamValue("asdf", false, { string: true }),
        bar: new params.ParamValue("jkl;", false, { string: true }),
      }),
    ).to.equal("asdf jkl;");
  });

  it("throws instead of coercing a param value with the wrong type", () => {
    expect(() =>
      params.resolveString("{{ params.foo }}", {
        foo: new params.ParamValue("0", false, { number: true }),
      }),
    ).to.throw();
    expect(() =>
      params.resolveInt("{{ params.foo }}", {
        foo: new params.ParamValue("asdf", false, { string: true }),
      }),
    ).to.throw();
  });

  it("can't handle non-identity CEL expressions yet", () => {
    expect(() =>
      params.resolveString("{{ params.foo == 0 ? 'asdf' : 'jkl;' }}", {
        foo: new params.ParamValue("0", false, { number: true }),
      }),
    ).to.throw();
  });
});

describe("resolveParams", () => {
  let input: sinon.SinonStub;
  let logBulletStub: sinon.SinonStub;

  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    input = sinon.stub(prompt, "input");
    logBulletStub = sinon.stub(utils, "logBullet");
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    input.restore();
    logBulletStub.restore();
    loggerInfoStub.restore();
  });

  it("always contains the precanned internal param values", async () => {
    const paramsToResolve: params.Param[] = [];
    const userEnv: Record<string, params.ParamValue> = {};
    expect(
      (
        await params.resolveParams({
          params: paramsToResolve,
          firebaseConfig: fakeConfig,
          userEnvs: userEnv,
          codebase: "default",
        })
      ).paramValues,
    ).to.deep.equal(expectedInternalParams);
  });

  it("can pull a literal value out of the dotenvs", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        type: "string",
      },
      {
        name: "bar",
        type: "int",
      },
    ];
    const userEnv: Record<string, params.ParamValue> = {
      foo: new params.ParamValue("bar", false, { string: true, number: false, boolean: false }),
      bar: new params.ParamValue("24", false, { string: false, number: true, boolean: false }),
      baz: new params.ParamValue("true", false, { string: false, number: false, boolean: true }),
    };
    expect(
      (
        await params.resolveParams({
          params: paramsToResolve,
          firebaseConfig: fakeConfig,
          userEnvs: userEnv,
          codebase: "default",
        })
      ).paramValues,
    ).to.deep.equal(
      Object.assign(
        {
          foo: new params.ParamValue("bar", false, { string: true, number: false, boolean: false }),
          bar: new params.ParamValue("24", false, { string: false, number: true, boolean: false }),
        },
        expectedInternalParams,
      ),
    );
  });

  it("params from dotenvs override internal params of the same name", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "PROJECT_ID",
        type: "string",
      },
    ];
    const userEnv: Record<string, params.ParamValue> = {
      PROJECT_ID: new params.ParamValue("other_value", false, {
        string: true,
        number: false,
        boolean: false,
      }),
    };
    expect(
      (
        await params.resolveParams({
          params: paramsToResolve,
          firebaseConfig: fakeConfig,
          userEnvs: userEnv,
          codebase: "default",
        })
      ).paramValues,
    ).to.deep.equal({
      DATABASE_URL: new params.ParamValue(fakeConfig.databaseURL, true, {
        string: true,
        boolean: false,
        number: false,
      }),
      GCLOUD_PROJECT: new params.ParamValue(fakeConfig.projectId, true, {
        string: true,
        boolean: false,
        number: false,
      }),
      PROJECT_ID: new params.ParamValue("other_value", false, {
        string: true,
        boolean: false,
        number: false,
      }),
      STORAGE_BUCKET: new params.ParamValue(fakeConfig.storageBucket, true, {
        string: true,
        boolean: false,
        number: false,
      }),
    });
  });

  it("does not create the corresponding internal params if database url/storage bucket are not configured", async () => {
    const paramsToResolve: params.Param[] = [];
    const userEnv: Record<string, params.ParamValue> = {};
    expect(
      (
        await params.resolveParams({
          params: paramsToResolve,
          firebaseConfig: { locationId: "", projectId: "foo", storageBucket: "", databaseURL: "" },
          userEnvs: userEnv,
          codebase: "default",
        })
      ).paramValues,
    ).to.deep.equal({
      GCLOUD_PROJECT: expectedInternalParams.GCLOUD_PROJECT,
      PROJECT_ID: expectedInternalParams.PROJECT_ID,
    });
  });

  it("can use a provided literal", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        default: "bar",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("bar");
    expect(
      (
        await params.resolveParams({
          params: paramsToResolve,
          firebaseConfig: fakeConfig,
          userEnvs: {},
          codebase: "default",
        })
      ).paramValues,
    ).to.deep.equal(
      Object.assign(
        {
          foo: new params.ParamValue("bar", false, { string: true }),
        },
        expectedInternalParams,
      ),
    );
  });

  it("can resolve a CEL identity expression", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        default: "baz",
        type: "string",
        input: { text: {} },
      },
      {
        name: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("baz");
    await params.resolveParams({
      params: paramsToResolve,
      firebaseConfig: fakeConfig,
      userEnvs: {},
      codebase: "default",
    });
    expect(input.getCall(1).args[0].default).to.eq("baz");
  });

  it("can resolve a CEL expression containing only identities", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        default: "baz",
        type: "string",
        input: { text: {} },
      },
      {
        name: "bar",
        default: "{{ params.foo }}/quox",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("baz");
    await params.resolveParams({
      params: paramsToResolve,
      firebaseConfig: fakeConfig,
      userEnvs: {},
      codebase: "default",
    });
    expect(input.getCall(1).args[0].default).to.eq("baz/quox");
  });

  it("can resolve a CEL expression depending on the internal params", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        default: "{{ params.DATABASE_URL }}/quox",
        type: "string",
        input: { text: {} },
      },
      {
        name: "foo",
        default: "projectID: {{ params.GCLOUD_PROJECT }}",
        type: "string",
        input: { text: {} },
      },
      {
        name: "foo",
        default: "http://{{ params.STORAGE_BUCKET }}.storage.googleapis.com/",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("baz");
    await params.resolveParams({
      params: paramsToResolve,
      firebaseConfig: fakeConfig,
      userEnvs: {},
      codebase: "default",
    });
    expect(input.getCall(0).args[0].default).to.eq("https://foo.firebaseio.com/quox");
    expect(input.getCall(1).args[0].default).to.eq("projectID: foo");
    expect(input.getCall(2).args[0].default).to.eq(
      "http://foo.appspot.com.storage.googleapis.com/",
    );
  });

  it("errors when the default is an unresolvable CEL expression", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("");
    await expect(
      params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
      }),
    ).to.eventually.be.rejected;
  });

  it("errors when the default is a CEL expression that resolves to the wrong type", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        default: "22",
        type: "string",
        input: { text: {} },
      },
      {
        name: "bar",
        default: "{{ params.foo }}",
        type: "int",
        input: { text: {} },
      },
    ];
    input.resolves("22");
    await expect(
      params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
      }),
    ).to.eventually.be.rejected;
  });

  it("preselects a boolean default in a select prompt", async () => {
    const select = sinon.stub(prompt, "select").resolves("false");
    try {
      const paramsToResolve: params.Param[] = [
        {
          name: "MAKE_PUBLIC",
          type: "boolean",
          default: false,
          input: {
            select: {
              options: [
                { label: "Yes", value: true },
                { label: "No", value: false },
              ],
            },
          },
        },
      ];
      const resolved = await params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
      });
      expect(select.firstCall.args[0].default).to.equal("false");
      expect(resolved.paramValues.MAKE_PUBLIC).to.deep.equal(
        new params.ParamValue("false", false, { string: false, number: false, boolean: true }),
      );
    } finally {
      select.restore();
    }
  });

  it("preselects an int default in a select prompt", async () => {
    const select = sinon.stub(prompt, "select").resolves("2");
    try {
      const paramsToResolve: params.Param[] = [
        {
          name: "REPLICAS",
          type: "int",
          default: 2,
          input: {
            select: {
              options: [
                { label: "One", value: 1 },
                { label: "Two", value: 2 },
              ],
            },
          },
        },
      ];
      const resolved = await params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
      });
      expect(select.firstCall.args[0].default).to.equal("2");
      expect(resolved.paramValues.REPLICAS).to.deep.equal(
        new params.ParamValue("2", false, { string: false, number: true, boolean: false }),
      );
    } finally {
      select.restore();
    }
  });

  it("does not throw in non-interactive mode if secret exists in cloud", async () => {
    const paramsToResolve: params.Param[] = [{ name: "MY_SECRET", type: "secret" }];
    const getSecretMetadataStub = sinon.stub(secretManager, "getSecretMetadata").resolves({
      secret: { name: "MY_SECRET", projectId: "foo", labels: {}, replication: {} },
      secretVersion: { versionId: "1", state: "ENABLED", secret: {} as any },
    });

    await expect(
      params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
        nonInteractive: true,
      }),
    ).to.be.fulfilled;

    getSecretMetadataStub.restore();
  });

  it("throws in non-interactive mode if secret is missing in cloud", async () => {
    const paramsToResolve: params.Param[] = [{ name: "MY_SECRET", type: "secret" }];
    const getSecretMetadataStub = sinon.stub(secretManager, "getSecretMetadata").resolves({
      secret: undefined,
    });

    await expect(
      params.resolveParams({
        params: paramsToResolve,
        firebaseConfig: fakeConfig,
        userEnvs: {},
        codebase: "default",
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(FirebaseError, /In non-interactive mode but have no value for the secret/);

    getSecretMetadataStub.restore();
  });

  it("never calls ensureSecret if running in the emulator", async () => {
    const paramsToResolve: params.Param[] = [{ name: "MY_SECRET", type: "secret" }];
    const getSecretMetadataSpy = sinon.spy(secretManager, "getSecretMetadata");

    await params.resolveParams({
      params: paramsToResolve,
      firebaseConfig: fakeConfig,
      userEnvs: {},
      codebase: "default",
      isEmulator: true,
    });
    expect(getSecretMetadataSpy.called).to.be.false;

    getSecretMetadataSpy.restore();
  });

  it("should print a header when prompting for a codebase", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        type: "string",
        input: { text: {} },
      },
    ];
    input.resolves("bar");
    await params.resolveParams({
      params: paramsToResolve,
      firebaseConfig: fakeConfig,
      userEnvs: {},
      codebase: "my-codebase",
    });
    expect(
      loggerInfoStub.calledWith(sinon.match(/Prompting for parameters for codebase.*my-codebase/)),
    ).to.be.true;
  });
});
