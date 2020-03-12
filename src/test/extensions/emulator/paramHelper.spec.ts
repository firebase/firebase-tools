import { expect } from "chai";
import * as paramHelper from "../../../extensions/emulator/paramHelper";

describe("paramHelper", () => {
  describe("substituteParams", () => {
    it("should replace ${params} with corresponding values", () => {
      const testParams = {
        PARAM: "value",
        PARAM2: "value2",
      };
      const testResource = {
        name: "name",
        properties: {
          prop1: "${PARAM}",
          prop2: "something/${PARAM2}",
        },
      };
      const expected = {
        name: "name",
        properties: {
          prop1: "value",
          prop2: "something/value2",
        },
      };

      const result = paramHelper.substituteParams(testResource, testParams);

      expect(result).to.eql(expected);
    });

    it("shouldn't affect objects with no ${params}", () => {
      const testParams = {
        PARAM: "value",
        PARAM2: "value2",
      };
      const testResource = {
        name: "name",
        properties: {
          prop1: "aPARAM",
          prop2: "something/PARAM2",
        },
      };
      const expected = {
        name: "name",
        properties: {
          prop1: "aPARAM",
          prop2: "something/PARAM2",
        },
      };

      const result = paramHelper.substituteParams(testResource, testParams);

      expect(result).to.eql(expected);
    });
  });
});
