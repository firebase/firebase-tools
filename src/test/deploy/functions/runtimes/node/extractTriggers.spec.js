"use strict";

const chai = require("chai");
const expect = chai.expect;

const extractTriggers = require("../../../../../deploy/functions/runtimes/node/extractTriggers");

describe("extractTriggers", function () {
  const fnWithTrigger = function () {};
  fnWithTrigger.__trigger = { service: "function.with.trigger" };
  const fnWithoutTrigger = function () {};
  let triggers;

  beforeEach(function () {
    triggers = [];
  });

  it("should find exported functions with __trigger", function () {
    extractTriggers(
      {
        foo: fnWithTrigger,
        bar: fnWithoutTrigger,
        baz: fnWithTrigger,
      },
      triggers,
    );

    expect(triggers.length).to.eq(2);
  });

  it("should attach name and entryPoint to exported triggers", function () {
    extractTriggers(
      {
        foo: fnWithTrigger,
      },
      triggers,
    );
    expect(triggers[0].name).to.eq("foo");
    expect(triggers[0].entryPoint).to.eq("foo");
  });

  it("should find nested functions and set name and entryPoint", function () {
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
      triggers,
    );

    expect(triggers[0].name).to.eq("foo-bar");
    expect(triggers[0].entryPoint).to.eq("foo.bar");
    expect(triggers.length).to.eq(3);
  });

  it("should ignore null exports", function () {
    expect(() =>
      extractTriggers(
        {
          foo: {
            bar: fnWithTrigger,
            baz: null,
          },
        },
        triggers,
      ),
    ).not.to.throw();

    expect(triggers[0].name).to.eq("foo-bar");
    expect(triggers.length).to.eq(1);
  });
});
