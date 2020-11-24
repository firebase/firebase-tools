"use strict";

var chai = require("chai");
var sinon = require("sinon");
var api = require("../api");
var accountImporter = require("../accountImporter");

var expect = chai.expect;
describe("accountImporter", function() {
  var transArrayToUser = accountImporter.transArrayToUser;
  var validateOptions = accountImporter.validateOptions;
  var validateUserJson = accountImporter.validateUserJson;
  var serialImportUsers = accountImporter.serialImportUsers;

  describe("transArrayToUser", function() {
    it("should reject when passwordHash is invalid base64", function() {
      return expect(transArrayToUser(["123", undefined, undefined, "false"])).to.have.property(
        "error"
      );
    });

    it("should not reject when passwordHash is valid base64", function() {
      return expect(
        transArrayToUser(["123", undefined, undefined, "Jlf7onfLbzqPNFP/1pqhx6fQF/w="])
      ).to.not.have.property("error");
    });
  });

  describe("validateOptions", function() {
    it("should reject when unsupported hash algorithm provided", function() {
      return expect(validateOptions({ hashAlgo: "MD2" })).to.be.rejected;
    });

    it("should reject when missing parameters", function() {
      return expect(validateOptions({ hashAlgo: "HMAC_SHA1" })).to.be.rejected;
    });
  });

  describe("validateUserJson", function() {
    it("should reject when unknown fields in user json", function() {
      return expect(
        validateUserJson({
          uid: "123",
          email: "test@test.org",
        })
      ).to.have.property("error");
    });

    it("should reject when unknown fields in providerUserInfo of user json", function() {
      return expect(
        validateUserJson({
          localId: "123",
          email: "test@test.org",
          providerUserInfo: [
            {
              providerId: "google.com",
              googleId: "abc",
              email: "test@test.org",
            },
          ],
        })
      ).to.have.property("error");
    });

    it("should reject when unknown providerUserInfo of user json", function() {
      return expect(
        validateUserJson({
          localId: "123",
          email: "test@test.org",
          providerUserInfo: [
            {
              providerId: "otheridp.com",
              rawId: "abc",
              email: "test@test.org",
            },
          ],
        })
      ).to.have.property("error");
    });

    it("should reject when passwordHash is invalid base64", function() {
      return expect(
        validateUserJson({
          localId: "123",
          passwordHash: "false",
        })
      ).to.have.property("error");
    });

    it("should not reject when passwordHash is valid base64", function() {
      return expect(
        validateUserJson({
          localId: "123",
          passwordHash: "Jlf7onfLbzqPNFP/1pqhx6fQF/w=",
        })
      ).to.not.have.property("error");
    });
  });

  describe("serialImportUsers", function() {
    var sandbox;
    var mockApi;
    var batches = [];
    var hashOptions = {
      hashAlgo: "HMAC_SHA1",
      hashKey: "a2V5MTIz",
    };
    var expectedResponse = [];

    beforeEach(function() {
      sandbox = sinon.createSandbox();
      mockApi = sandbox.mock(api);
      for (var i = 0; i < 10; i++) {
        batches.push([
          {
            localId: i.toString(),
            email: "test" + i + "@test.org",
          },
        ]);
        expectedResponse.push({
          status: 200,
          response: "",
          body: "",
        });
      }
    });

    afterEach(function() {
      mockApi.verify();
      sandbox.restore();
      batches = [];
      expectedResponse = [];
    });

    it("should call api.request multiple times", function(done) {
      for (var i = 0; i < batches.length; i++) {
        mockApi
          .expects("request")
          .withArgs("POST", "/identitytoolkit/v3/relyingparty/uploadAccount", {
            auth: true,
            data: {
              hashAlgorithm: "HMAC_SHA1",
              signerKey: "a2V5MTIz",
              targetProjectId: "test-project-id",
              users: [{ email: "test" + i + "@test.org", localId: i.toString() }],
            },
            json: true,
            origin: "https://www.googleapis.com",
          })
          .once()
          .resolves(expectedResponse[i]);
      }
      return expect(
        serialImportUsers("test-project-id", hashOptions, batches, 0)
      ).to.eventually.notify(done);
    });

    it("should continue when some request's response is 200 but has `error` in response", function(done) {
      expectedResponse[5] = {
        status: 200,
        response: "",
        body: {
          error: [
            {
              index: 0,
              message: "some error message",
            },
          ],
        },
      };
      for (var i = 0; i < batches.length; i++) {
        mockApi
          .expects("request")
          .withArgs("POST", "/identitytoolkit/v3/relyingparty/uploadAccount", {
            auth: true,
            data: {
              hashAlgorithm: "HMAC_SHA1",
              signerKey: "a2V5MTIz",
              targetProjectId: "test-project-id",
              users: [{ email: "test" + i + "@test.org", localId: i.toString() }],
            },
            json: true,
            origin: "https://www.googleapis.com",
          })
          .once()
          .resolves(expectedResponse[i]);
      }
      return expect(
        serialImportUsers("test-project-id", hashOptions, batches, 0)
      ).to.eventually.notify(done);
    });
  });
});
