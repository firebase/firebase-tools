import * as chai from "chai";
import * as sinon from "sinon";
chai.use(require("chai-as-promised"));
const expect = chai.expect;
const prompt = require("../../../prompt");

import * as params from "../../../deploy/functions/params";

describe("resolveParams", () => {
  let promptOnce: sinon.SinonStub;

  beforeEach(() => {
    promptOnce = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptOnce.restore();
  });

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

  it("can use a provided literal", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "bar",
        type: "string",
        input: { type: "text", text: {} },
      },
    ];
    promptOnce.returns(Promise.resolve("bar"));
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.deep.equal({
      foo: "bar",
    });
  });

  it("can resolve a CEL identity expression", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "baz",
        type: "string",
        input: { type: "text", text: {} },
      },
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { type: "text", text: {} },
      },
    ];
    promptOnce.returns(Promise.resolve("baz"));
    await params.resolveParams(paramsToResolve, "", {});
    expect(promptOnce.getCall(1).args[0].default).to.eq("baz");
  });

  it("can resolve a CEL expression containing only identities", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "baz",
        type: "string",
        input: { type: "text", text: {} },
      },
      {
        param: "bar",
        default: "{{ params.foo }}/quox",
        type: "string",
        input: { type: "text", text: {} },
      },
    ];
    promptOnce.returns(Promise.resolve("baz"));
    await params.resolveParams(paramsToResolve, "", {});
    expect(promptOnce.getCall(1).args[0].default).to.eq("baz/quox");
  });

  it("errors when the default is an unresolvable CEL expression", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "string",
        input: { type: "text", text: {} },
      },
    ];
    promptOnce.returns(Promise.resolve(""));
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
  });

  it("errors when the default is a CEL expression that resolves to the wrong type", async () => {
    const paramsToResolve: params.Param[] = [
      {
        param: "foo",
        default: "22",
        type: "string",
        input: { type: "text", text: {} },
      },
      {
        param: "bar",
        default: "{{ params.foo }}",
        type: "int",
        input: { type: "text", text: {} },
      },
    ];
    promptOnce.returns(Promise.resolve("22"));
    await expect(params.resolveParams(paramsToResolve, "", {})).to.eventually.be.rejected;
  });
});
