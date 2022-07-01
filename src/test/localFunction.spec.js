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

var chai = require("chai");
var expect = chai.expect;

var LocalFunction = require("../localFunction");

describe("localFunction._constructAuth", function () {
  var lf = new LocalFunction({});

  describe("#_constructAuth", function () {
    var constructAuth = lf._constructAuth;

    it("warn if opts.auth and opts.authType are conflicting", function () {
      expect(function () {
        return constructAuth({ uid: "something" }, "UNAUTHENTICATED");
      }).to.throw("incompatible");

      expect(function () {
        return constructAuth({ uid: "something" }, "ADMIN");
      }).to.throw("incompatible");
    });

    it("construct the correct auth for admin users", function () {
      expect(constructAuth(undefined, "ADMIN")).to.deep.equal({ admin: true });
    });

    it("construct the correct auth for unauthenticated users", function () {
      expect(constructAuth(undefined, "UNAUTHENTICATED")).to.deep.equal({
        admin: false,
      });
    });

    it("construct the correct auth for authenticated users", function () {
      expect(constructAuth(undefined, "USER")).to.deep.equal({
        variable: { uid: "", token: {} },
      });
      expect(constructAuth({ uid: "11" }, "USER")).to.deep.equal({
        variable: { uid: "11", token: {} },
      });
    });

    it("leaves auth untouched if it already follows wire format", function () {
      var auth = { variable: { uid: "something" } };
      expect(constructAuth(auth)).to.deep.equal(auth);
    });
  });

  describe("localFunction._makeFirestoreValue", function () {
    var makeFirestoreValue = lf._makeFirestoreValue;

    it("returns {} when there is no data", function () {
      expect(makeFirestoreValue()).to.deep.equal({});
      expect(makeFirestoreValue(null)).to.deep.equal({});
      expect(makeFirestoreValue({})).to.deep.equal({});
    });

    it("throws error when data is not key-value pairs", function () {
      expect(function () {
        return makeFirestoreValue("string");
      }).to.throw(Error);
    });
  });
});
