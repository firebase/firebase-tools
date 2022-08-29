import * as chai from "chai";
import * as sinon from "sinon";

import * as prompt from "../../../prompt";
import * as params from "../../../deploy/functions/params";

const expect = chai.expect;

describe("CEL resolution", () => {
  it("can interpolate a provided param into a CEL expression", () => {
    expect(
      params.resolveString("{{ params.foo }} baz", {
        foo: new params.ParamValue("bar", false, { string: true }),
      })
    ).to.equal("bar baz");
  });

  it("can interpolate multiple params into a CEL expression", () => {
    expect(
      params.resolveString("{{ params.foo }} {{ params.bar }}", {
        foo: new params.ParamValue("asdf", false, { string: true }),
        bar: new params.ParamValue("jkl;", false, { string: true }),
      })
    ).to.equal("asdf jkl;");
  });

  it("throws instead of coercing a param value with the wrong type", () => {
    expect(() =>
      params.resolveString("{{ params.foo }}", {
        foo: new params.ParamValue("0", false, { number: true }),
      })
    ).to.throw();
    expect(() =>
      params.resolveInt("{{ params.foo }}", {
        foo: new params.ParamValue("asdf", false, { string: true }),
      })
    ).to.throw();
  });

  it("can't handle non-identity CEL expressions yet", () => {
    expect(() =>
      params.resolveString("{{ params.foo == 0 ? 'asdf' : 'jkl;' }}", {
        foo: new params.ParamValue("0", false, { number: true }),
      })
    ).to.throw();
  });
});

describe("resolveParams", () => {
  let promptOnce: sinon.SinonStub;

  beforeEach(() => {
    promptOnce = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptOnce.restore();
  });

  it("can pull a literal value out of the dotenvs, with any type valid", async () => {
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
      foo: new params.ParamValue("bar", false, { string: true, number: true, boolean: true }),
      bar: new params.ParamValue("24", false, { string: true, number: true, boolean: true }),
      baz: new params.ParamValue("true", false, { string: true, number: true, boolean: true }),
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.deep.equal({
      foo: new params.ParamValue("bar", false, { string: true, number: true, boolean: true }),
      bar: new params.ParamValue("24", false, { string: true, number: true, boolean: true }),
    });

    /* TODO(vsfan@): should we ever reject param values from .env files based on the appearance of the string?
  it("errors when the dotenvs provide a value of the wrong type", async () => {
    const paramsToResolve: params.Param[] = [
      {
        name: "foo",
        type: "string",
      },
    ];
    const userEnv: Record<string, params.ParamValue> = {
      foo: new params.ParamValue("22", false, { number: true }),
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.be.rejected;
    */
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
    promptOnce.resolves("bar");
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.deep.equal({
      foo: new params.ParamValue("bar", false, { string: true }),
    });
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
    promptOnce.resolves("baz");
    await params.resolveParams(paramsToResolve, "", {});
    expect(promptOnce.getCall(1).args[0].default).to.eq("baz");
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
    promptOnce.resolves("baz");
    await params.resolveParams(paramsToResolve, "", {});
    expect(promptOnce.getCall(1).args[0].default).to.eq("baz/quox");
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
    promptOnce.resolves("");
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
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
    promptOnce.resolves("22");
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
  });
});
