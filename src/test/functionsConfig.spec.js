"use strict";

var chai = require("chai");
var expect = chai.expect;

var functionsConfig = require("../functionsConfig");

describe("config.parseSetArgs", function() {
  it("should throw if a reserved namespace is used", function() {
    expect(function() {
      functionsConfig.parseSetArgs(["firebase.something=else"]);
    }).to.throw("reserved namespace");
  });

  it("should throw if a malformed arg is used", function() {
    expect(function() {
      functionsConfig.parseSetArgs(["foo.bar=baz", "qux"]);
    }).to.throw("must be in key=val format");
  });

  it("should parse args into correct config and variable IDs", function() {
    expect(functionsConfig.parseSetArgs(["foo.bar.faz=val"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
        val: "val",
      },
    ]);
  });
});

describe("config.parseUnsetArgs", function() {
  it("should throw if a reserved namespace is used", function() {
    expect(function() {
      functionsConfig.parseUnsetArgs(["firebase.something"]);
    }).to.throw("reserved namespace");
  });

  it("should parse args into correct config and variable IDs", function() {
    expect(functionsConfig.parseUnsetArgs(["foo.bar.faz"])).to.deep.eq([
      {
        configId: "foo",
        varId: "bar/faz",
      },
    ]);
  });
});
