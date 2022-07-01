/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

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
      triggers
    );

    expect(triggers.length).to.eq(2);
  });

  it("should attach name and entryPoint to exported triggers", function () {
    extractTriggers(
      {
        foo: fnWithTrigger,
      },
      triggers
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
      triggers
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
        triggers
      )
    ).not.to.throw();

    expect(triggers[0].name).to.eq("foo-bar");
    expect(triggers.length).to.eq(1);
  });
});
