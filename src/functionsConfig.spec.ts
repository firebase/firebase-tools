import { expect } from "chai";

import * as functionsConfig from "./functionsConfig";

describe("config.parseSetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["firebase.something=else"]);
    }).to.throw("reserved namespace");
  });

  it("should throw if a malformed arg is used", () => {
    expect(() => {
      functionsConfig.parseSetArgs(["foo.bar=baz", "qux"]);
    }).to.throw("must be in key=val format");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseSetArgs(["foo.bar.faz=val"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
        val: "val",
      },
    ]);
  });
});

describe("config.parseUnsetArgs", () => {
  it("should throw if a reserved namespace is used", () => {
    expect(() => {
      functionsConfig.parseUnsetArgs(["firebase.something"]);
    }).to.throw("reserved namespace");
  });

  it("should parse args into correct config and variable IDs", () => {
    expect(functionsConfig.parseUnsetArgs(["foo.bar.faz"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
      },
    ]);
  });
});
