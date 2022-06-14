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

  it("can pull a CEL expression out of the dotenvs", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        type: "string",
      },
      {
        param: "bar",
        type: "string",
      },
    ];
    const userEnv: Record<string, string | number | boolean> = {
      foo: "{{ params.bar }}",
      bar: "baz",
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.deep.equal({
      foo: "baz",
      bar: "baz",
    });
  });

  it("errors when a CEL expression references a parameter that isn't defined", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        type: "string",
      },
    ];
    const userEnv: Record<string, string | number | boolean> = {
      foo: "{{ params.bar }}",
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.be.rejected;
  });

  it("errors when a CEL expression has circular dependencies", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        type: "string",
      },
      {
        param: "bar",
        type: "string",
      },
    ];
    const userEnv: Record<string, string | number | boolean> = {
      foo: "{{ params.bar }}",
      bar: "{{ params.foo }}",
    };
    await expect(params.resolveParams(paramsToResolve, "", userEnv)).to.eventually.be.rejected;
  });
});
