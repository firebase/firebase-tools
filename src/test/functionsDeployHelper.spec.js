"use strict";

var chai = require("chai");
var expect = chai.expect;

var helper = require("../functionsDeployHelper");

describe("functionsDeployHelper", function() {
  describe("getFilterGroups", function() {
    it("should parse multiple filters", function() {
      var options = {
        only: "functions:myFunc,functions:myOtherFunc",
      };
      expect(helper.getFilterGroups(options)).to.deep.equal([["myFunc"], ["myOtherFunc"]]);
    });
    it("should parse nested filters", function() {
      var options = {
        only: "functions:groupA.myFunc",
      };
      expect(helper.getFilterGroups(options)).to.deep.equal([["groupA", "myFunc"]]);
    });
  });

  describe("getReleaseNames", function() {
    it("should handle function update", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      var filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle function deletion", function() {
      var uploadNames = [];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      var filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle function creation", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      var existingNames = [];
      var filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle existing function not being in filter", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myFunc2"];
      var filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle no functions satisfying filter", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc2"];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myFunc3"];
      var filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([]);
    });

    it("should handle entire function groups", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myGroup-func1"];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myGroup-func2"];
      var filter = [["myGroup"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myGroup-func1",
        "projects/myProject/locations/us-central1/functions/myGroup-func2",
      ]);
    });

    it("should handle functions within groups", function() {
      var uploadNames = ["projects/myProject/locations/us-central1/functions/myGroup-func1"];
      var existingNames = ["projects/myProject/locations/us-central1/functions/myGroup-func2"];
      var filter = [["myGroup", "func1"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myGroup-func1",
      ]);
    });
  });

  describe("getFunctionsInfo", function() {
    it("should handle default region", function() {
      var triggers = [
        {
          name: "myFunc",
        },
        {
          name: "myOtherFunc",
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-central1/functions/myFunc",
        },
        {
          name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
        },
      ]);
    });

    it("should handle customized region", function() {
      var triggers = [
        {
          name: "myFunc",
          regions: ["us-east1"],
        },
        {
          name: "myOtherFunc",
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-east1/functions/myFunc",
        },
        {
          name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
        },
      ]);
    });

    it("should handle multiple customized region for a function", function() {
      var triggers = [
        {
          name: "myFunc",
          regions: ["us-east1", "eu-west1"],
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-east1/functions/myFunc",
        },
        {
          name: "projects/myProject/locations/eu-west1/functions/myFunc",
        },
      ]);
    });
  });
});
