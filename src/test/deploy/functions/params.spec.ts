import * as chai from "chai";
chai.use(require("chai-as-promised"));
const expect = chai.expect;

import * as params from "../../../deploy/functions/params";

describe("resolveParams", () => {
  it("can pull a literal value out of the dotenvs", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        type: "string",
      },
    ];
    const userEnv: Record<string, string | number | boolean> = {
      foo: "bar",
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.deep.equal({
      foo: "bar",
    });
  });

  it("errors when the dotenvs provide a value of the wrong type", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        type: "string",
      },
    ];
    const userEnv: Record<string, string | number | boolean> = {
      foo: 22,
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.be.rejected;
  });

  it("can use a provided literal as default", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "bar",
        type: "string",
        input: { type: "hardcoded" },
      },
    ];
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.deep.equal({
      foo: "bar",
    });
  });

  it("can resolve a CEL expression and use it as default", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "baz",
        type: "string",
        input: { type: "hardcoded" },
      },
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { type: "hardcoded" },
      },
    ];
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.deep.equal({
      foo: "baz",
      bar: "baz",
    });
  });

  it("errors when the default is an unresolvable CEL expression", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { type: "hardcoded" },
      },
    ];
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
  });

  it("errors when the default is a CEL expression that resolves to the wrong type", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: 22,
        type: "int",
        input: { type: "hardcoded" },
      },
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { type: "hardcoded" },
      },
    ];
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
  });
});
