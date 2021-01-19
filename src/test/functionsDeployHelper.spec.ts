import { expect } from "chai";

import * as helper from "../functionsDeployHelper";

describe("functionsDeployHelper", () => {
  describe("getFilterGroups", () => {
    it("should parse multiple filters", () => {
      const options = {
        only: "functions:myFunc,functions:myOtherFunc",
      };
      expect(helper.getFilterGroups(options)).to.deep.equal([["myFunc"], ["myOtherFunc"]]);
    });
    it("should parse nested filters", () => {
      const options = {
        only: "functions:groupA.myFunc",
      };
      expect(helper.getFilterGroups(options)).to.deep.equal([["groupA", "myFunc"]]);
    });
  });

  describe("getReleaseNames", () => {
    it("should handle function update", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      const filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle function deletion", () => {
      const uploadNames: string[] = [];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      const filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle function creation", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      const existingNames: string[] = [];
      const filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle existing function not being in filter", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc"];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myFunc2"];
      const filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myFunc",
      ]);
    });

    it("should handle no functions satisfying filter", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myFunc2"];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myFunc3"];
      const filter = [["myFunc"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([]);
    });

    it("should handle entire function groups", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myGroup-func1"];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myGroup-func2"];
      const filter = [["myGroup"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myGroup-func1",
        "projects/myProject/locations/us-central1/functions/myGroup-func2",
      ]);
    });

    it("should handle functions within groups", () => {
      const uploadNames = ["projects/myProject/locations/us-central1/functions/myGroup-func1"];
      const existingNames = ["projects/myProject/locations/us-central1/functions/myGroup-func2"];
      const filter = [["myGroup", "func1"]];

      expect(helper.getReleaseNames(uploadNames, existingNames, filter)).to.deep.equal([
        "projects/myProject/locations/us-central1/functions/myGroup-func1",
      ]);
    });
  });

  describe("getFunctionsInfo", () => {
    it("should handle default region", () => {
      const triggers = [
        {
          name: "myFunc",
          labels: {},
          environmentVariables: {},
        },
        {
          name: "myOtherFunc",
          labels: {},
          environmentVariables: {},
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-central1/functions/myFunc",
          labels: {},
          environmentVariables: {},
        },
        {
          name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
          labels: {},
          environmentVariables: {},
        },
      ]);
    });

    it("should handle customized region", () => {
      const triggers = [
        {
          name: "myFunc",
          regions: ["us-east1"],
          labels: {},
          environmentVariables: {},
        },
        {
          name: "myOtherFunc",
          labels: {},
          environmentVariables: {},
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-east1/functions/myFunc",
          labels: {},
          environmentVariables: {},
        },
        {
          name: "projects/myProject/locations/us-central1/functions/myOtherFunc",
          labels: {},
          environmentVariables: {},
        },
      ]);
    });

    it("should handle multiple customized region for a function", () => {
      const triggers = [
        {
          name: "myFunc",
          regions: ["us-east1", "eu-west1"],
          labels: {},
          environmentVariables: {},
        },
      ];

      expect(helper.getFunctionsInfo(triggers, "myProject")).to.deep.equal([
        {
          name: "projects/myProject/locations/us-east1/functions/myFunc",
          labels: {},
          environmentVariables: {},
        },
        {
          name: "projects/myProject/locations/eu-west1/functions/myFunc",
          labels: {},
          environmentVariables: {},
        },
      ]);
    });
  });
});
