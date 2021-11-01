import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as helper from "../../../deploy/functions/functionsDeployHelper";
import { Options } from "../../../options";

describe("functionsDeployHelper", () => {
  const ENDPOINT: Omit<backend.Endpoint, "id"> = {
    platform: "gcfv1",
    project: "project",
    region: "us-central1",
    runtime: "nodejs16",
    entryPoint: "function",
  };

  describe("functionMatchesGroup", () => {
    it("should match empty filters", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesGroup(func, [])).to.be.true;
    });

    it("should match full names", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesGroup(func, ["id"])).to.be.true;
    });

    it("should match group prefixes", () => {
      const func = { ...ENDPOINT, id: "group-subgroup-func" };
      expect(helper.functionMatchesGroup(func, ["group", "subgroup", "func"])).to.be.true;
      expect(helper.functionMatchesGroup(func, ["group", "subgroup"])).to.be.true;
      expect(helper.functionMatchesGroup(func, ["group"])).to.be.true;
    });

    it("should exclude functions that don't match", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesGroup(func, ["group"])).to.be.false;
    });
  });

  describe("functionMatchesAnyGroup", () => {
    it("should match empty filters", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesAnyGroup(func, [[]])).to.be.true;
    });

    it("should match against one filter", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesAnyGroup(func, [["id"], ["group"]])).to.be.true;
    });

    it("should exclude functions that don't match", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.functionMatchesAnyGroup(func, [["group"], ["other-group"]])).to.be.false;
    });
  });

  describe("getFilterGroups", () => {
    it("should parse multiple filters", () => {
      const options = {
        only: "functions:myFunc,functions:myOtherFunc",
      } as Options;
      expect(helper.getFilterGroups(options)).to.deep.equal([["myFunc"], ["myOtherFunc"]]);
    });

    it("should parse nested filters", () => {
      const options = {
        only: "functions:groupA.myFunc",
      } as Options;
      expect(helper.getFilterGroups(options)).to.deep.equal([["groupA", "myFunc"]]);
    });
  });
});
