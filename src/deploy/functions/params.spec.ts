import * as chai from "chai";
import * as sinon from "sinon";

import * as prompt from "../../prompt";
import * as params from "./params";
import * as secretManager from "../../gcp/secretManager";
import { FirebaseError } from "../../error";

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

  beforeEach(() => {
    input = sinon.stub(prompt, "input");
  });

  afterEach(() => {
    input.restore();
  });

  it("always contains the precanned internal param values", async () => {
    const paramsToResolve: params.Param[] = [];
    const userEnv: Record<string, params.ParamValue> = {};
    await expect(
      params.resolveParams(paramsToResolve, fakeConfig, userEnv),
    ).to.eventually.deep.equal(expectedInternalParams);
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
    await expect(
      params.resolveParams(paramsToResolve, fakeConfig, userEnv),
    ).to.eventually.deep.equal(
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
    await expect(
      params.resolveParams(paramsToResolve, fakeConfig, userEnv),
    ).to.eventually.deep.equal({
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
    await expect(
      params.resolveParams(
        paramsToResolve,
        { locationId: "", projectId: "foo", storageBucket: "", databaseURL: "" },
        userEnv,
      ),
    ).to.eventually.deep.equal({
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
    await expect(params.resolveParams(paramsToResolve, fakeConfig, {})).to.eventually.deep.equal(
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
    await params.resolveParams(paramsToResolve, fakeConfig, {});
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
    await params.resolveParams(paramsToResolve, fakeConfig, {});
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
    await params.resolveParams(paramsToResolve, fakeConfig, {});
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
    await expect(params.resolveParams(paramsToResolve, fakeConfig, {})).to.eventually.be.rejected;
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
    await expect(params.resolveParams(paramsToResolve, fakeConfig, {})).to.eventually.be.rejected;
  });

  describe("non-interactive mode with secrets", () => {
    let getSecretMetadataStub: sinon.SinonStub;

    beforeEach(() => {
      getSecretMetadataStub = sinon.stub(secretManager, "getSecretMetadata");
    });

    afterEach(() => {
      getSecretMetadataStub.restore();
    });

    it("should succeed when secrets already exist in Secret Manager", async () => {
      const paramsToResolve: params.Param[] = [
        {
          name: "MY_SECRET",
          type: "secret",
        },
      ];
      getSecretMetadataStub.resolves({
        secret: { name: "MY_SECRET" },
        secretVersion: { name: "MY_SECRET/versions/1", state: "ENABLED" },
      });

      await expect(params.resolveParams(paramsToResolve, fakeConfig, {}, { nonInteractive: true }))
        .to.eventually.be.fulfilled;
    });

    it("should throw error when secrets don't exist in non-interactive mode", async () => {
      const paramsToResolve: params.Param[] = [
        {
          name: "MISSING_SECRET",
          type: "secret",
        },
      ];
      getSecretMetadataStub.resolves({});

      await expect(
        params.resolveParams(paramsToResolve, fakeConfig, {}, { nonInteractive: true }),
      ).to.eventually.be.rejectedWith(
        FirebaseError,
        /In non-interactive mode but have no value for the following secrets: MISSING_SECRET/,
      );
    });

    it("should only report missing secrets, not existing ones in non-interactive mode", async () => {
      const paramsToResolve: params.Param[] = [
        {
          name: "EXISTING_SECRET",
          type: "secret",
        },
        {
          name: "MISSING_SECRET",
          type: "secret",
        },
      ];
      getSecretMetadataStub.callsFake((projectId: string, secretName: string) => {
        if (secretName === "EXISTING_SECRET") {
          return Promise.resolve({
            secret: { name: "EXISTING_SECRET" },
            secretVersion: { name: "EXISTING_SECRET/versions/1", state: "ENABLED" },
          });
        }
        return Promise.resolve({});
      });

      try {
        await params.resolveParams(paramsToResolve, fakeConfig, {}, { nonInteractive: true });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("MISSING_SECRET");
        expect(err.message).to.not.include("EXISTING_SECRET");
      }
    });

    it("should include format flag in error for JSON secrets", async () => {
      const paramsToResolve: params.Param[] = [
        {
          name: "JSON_SECRET",
          type: "secret",
          format: "json",
        },
      ];
      getSecretMetadataStub.resolves({});

      try {
        await params.resolveParams(paramsToResolve, fakeConfig, {}, { nonInteractive: true });
        expect.fail("Should have thrown an error");
      } catch (err: any) {
        expect(err.message).to.include("--format=json --data-file <file.json>");
      }
    });
  });
});
