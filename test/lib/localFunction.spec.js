"use strict";

var chai = require("chai");
var expect = chai.expect;

var LocalFunction = require("../../lib/localFunction");

describe("localFunction._constructAuth", function() {
  var lf = new LocalFunction({});
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
