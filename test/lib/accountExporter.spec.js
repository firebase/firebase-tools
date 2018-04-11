"use strict";

var chai = require("chai");
var nock = require("nock");
var os = require("os");
var sinon = require("sinon");

var accountExporter = require("../../lib/accountExporter");
var helpers = require("../helpers");

var expect = chai.expect;
describe("accountExporter", function() {
  var validateOptions = accountExporter.validateOptions;
  var serialExportUsers = accountExporter.serialExportUsers;

  describe("validateOptions", function() {
    it("should reject when no format provided", function() {
      return expect(validateOptions({}, "output_file")).to.be.rejected;
    });

    it("should reject when format is not csv or json", function() {
      return expect(validateOptions({ format: "txt" }, "output_file")).to.be.rejected;
    });

    it("should ignore format param when implicitly specified in file name", function() {
      var ret = validateOptions({ format: "JSON" }, "output_file.csv");
      expect(ret.format).to.eq("csv");
    });

    it("should use format param when not implicitly specified in file name", function() {
      var ret = validateOptions({ format: "JSON" }, "output_file");
      expect(ret.format).to.eq("json");
    });
  });

  describe("serialExportUsers", function() {
    var sandbox;
    var userList = [];
    var writeStream = {
      write: function() {},
      end: function() {},
    };
    var spyWrite;

    beforeEach(function() {
      sandbox = sinon.sandbox.create();
      helpers.mockAuth(sandbox);
      spyWrite = sandbox.spy(writeStream, "write");
      for (var i = 1; i <= 7; i++) {
        userList.push({
          localId: i.toString(),
          email: "test" + i + "@test.org",
        });
      }
    });

    afterEach(function() {
      sandbox.restore();
      nock.cleanAll();
      userList = [];
    });

    it("should call api.request multiple times", function() {
      nock("https://www.googleapis.com")
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(0, 3),
          nextPageToken: "3",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "3",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(3, 6),
          nextPageToken: "6",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "6",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(6, 7),
          nextPageToken: "7",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "7",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: [],
          nextPageToken: "7",
        });

      var result = serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: writeStream,
      });
      return result.then(function() {
        expect(spyWrite.callCount).to.eq(7);
        expect(spyWrite.getCall(0).args[0]).to.eq(JSON.stringify(userList[0], null, 2));
        for (var j = 1; j < 7; j++) {
          expect(spyWrite.getCall(j).args[0]).to.eq(
            "," + os.EOL + JSON.stringify(userList[j], null, 2)
          );
        }
      });
    });
  });
});
