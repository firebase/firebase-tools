"use strict";

var chai = require("chai");
chai.use(require("chai-as-promised"));
var expect = chai.expect;
var sinon = require("sinon");

var helpers = require("../helpers");
var identifierToProjectId = require("../../lib/identifierToProjectId");
var api = require("../../lib/api");

describe("identifierToProjectId", function() {
  var sandbox;
  var mockApi;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();
    helpers.mockAuth(sandbox);
    mockApi = sandbox.mock(api);
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should return a project id if there is an exact match", function() {
    mockApi.expects("getProjects").resolves({ foobar: {} });
    return expect(identifierToProjectId("foobar")).to.eventually.equal("foobar");
  });

  it("should return an instance if one is a match", function() {
    mockApi.expects("getProjects").resolves({
      foo: { instances: { database: ["bar"] } },
    });
    return expect(identifierToProjectId("bar")).to.eventually.equal("foo");
  });

  it("should return null if no match is found", function() {
    mockApi.expects("getProjects").resolves({
      foo: { instances: { database: ["bar"] } },
    });
    return expect(identifierToProjectId("nope")).to.eventually.be.null;
  });
});
