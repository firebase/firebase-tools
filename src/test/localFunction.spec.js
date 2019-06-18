"use strict";

var chai = require("chai");
var expect = chai.expect;

var LocalFunction = require("../localFunction");

describe("localFunction._constructAuth", function() {
  var lf = new LocalFunction({});

  describe("#_constructAuth", function() {
    var constructAuth = lf._constructAuth;

    it("warn if opts.auth and opts.authType are conflicting", function() {
      expect(function() {
        return constructAuth({ uid: "something" }, "UNAUTHENTICATED");
      }).to.throw("incompatible");

      expect(function() {
        return constructAuth({ uid: "something" }, "ADMIN");
      }).to.throw("incompatible");
    });

    it("construct the correct auth for admin users", function() {
      expect(constructAuth(undefined, "ADMIN")).to.deep.equal({ admin: true });
    });

    it("construct the correct auth for unauthenticated users", function() {
      expect(constructAuth(undefined, "UNAUTHENTICATED")).to.deep.equal({
        admin: false,
      });
    });

    it("construct the correct auth for authenticated users", function() {
      expect(constructAuth(undefined, "USER")).to.deep.equal({
        variable: { uid: "", token: {} },
      });
      expect(constructAuth({ uid: "11" }, "USER")).to.deep.equal({
        variable: { uid: "11", token: {} },
      });
    });

    it("leaves auth untouched if it already follows wire format", function() {
      var auth = { variable: { uid: "something" } };
      expect(constructAuth(auth)).to.deep.equal(auth);
    });
  });

  describe("localFunction._makeFirestoreValue", function() {
    var makeFirestoreValue = lf._makeFirestoreValue;

    it("returns {} when there is no data", function() {
      expect(makeFirestoreValue()).to.deep.equal({});
      expect(makeFirestoreValue(null)).to.deep.equal({});
      expect(makeFirestoreValue({})).to.deep.equal({});
    });

    it("throws error when data is not key-value pairs", function() {
      expect(function() {
        return makeFirestoreValue("string");
      }).to.throw(Error);
    });
  });
});
