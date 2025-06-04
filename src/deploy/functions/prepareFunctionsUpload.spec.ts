import { expect } from "chai";
import * as prepareFunctionsUpload from "./prepareFunctionsUpload";

describe("prepareFunctionsUpload", () => {
  describe("convertToSortedKeyValueArray", () => {
    it("should deep sort the resulting array when an input config object is not sorted", () => {
      const config = {
        b: "b",
        a: {
          b: {
            c: "c",
            a: "a",
          },
          a: "a",
        },
      };
      const expected = [
        {
          key: "a",
          value: [
            { key: "a", value: "a" },
            {
              key: "b",
              value: [
                {
                  key: "a",
                  value: "a",
                },
                {
                  key: "c",
                  value: "c",
                },
              ],
            },
          ],
        },
        { key: "b", value: "b" },
      ];
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray(config)).to.deep.equal(expected);
    });
    it("should return null when config input is null", () => {
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray(null)).to.be.equal(null);
    });
    it("should return an empty array when config input is an empty object", () => {
      expect(prepareFunctionsUpload.convertToSortedKeyValueArray({})).to.deep.equal([]);
    });
  });
});
