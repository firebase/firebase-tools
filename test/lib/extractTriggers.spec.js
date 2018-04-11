"use strict";

var chai = require("chai");
var expect = chai.expect;

var extractTriggers = require("../../lib/extractTriggers");

describe("extractTriggers", function() {
  var fnWithTrigger = function() {};
  fnWithTrigger.__trigger = { service: "function.with.trigger" };
  var fnWithoutTrigger = function() {};
  var triggers;

  beforeEach(function() {
    triggers = [];
  });

  it("should find exported functions with __trigger", function() {
    extractTriggers(
      {
        foo: fnWithTrigger,
        bar: fnWithoutTrigger,
        baz: fnWithTrigger,
      },
      triggers
    );

    expect(triggers.length).to.eq(2);
  });

  it("should attach name and entryPoint to exported triggers", function() {
    extractTriggers(
      {
        foo: fnWithTrigger,
      },
      triggers
    );
    expect(triggers[0].name).to.eq("foo");
    expect(triggers[0].entryPoint).to.eq("foo");
  });

  it("should find nested functions and set name and entryPoint", function() {
    extractTriggers(
      {
        foo: {
          bar: fnWithTrigger,
          baz: {
            qux: fnWithTrigger,
            not: fnWithoutTrigger,
          },
        },
        baz: fnWithTrigger,
      },
      triggers
    );

    expect(triggers[0].name).to.eq("foo-bar");
    expect(triggers[0].entryPoint).to.eq("foo.bar");
    expect(triggers.length).to.eq(3);
  });
});
